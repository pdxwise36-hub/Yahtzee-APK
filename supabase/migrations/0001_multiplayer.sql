-- Yahtzee online multiplayer.
--
-- Everything lives in its own `yahtzee` schema so this can be applied to a
-- project that already hosts another app without colliding with it.
--
-- The design point worth knowing: dice values are never stored or sent. A
-- match is (seed, ordered move log), and every client derives the dice by
-- replaying that log through the same deterministic rules engine. So this
-- schema stores intentions, not outcomes, and there is nothing here for a
-- client to lie about that would change what it rolls.

create schema if not exists yahtzee;

-- ---------------------------------------------------------------- tables

create table if not exists yahtzee.matches (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  host_id     uuid not null references auth.users(id) on delete cascade,
  variant     text not null check (variant in ('standard', 'triple', 'sixDice')),
  seed        bigint not null,
  status      text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  created_at  timestamptz not null default now()
);

create table if not exists yahtzee.match_players (
  match_id   uuid not null references yahtzee.matches(id) on delete cascade,
  player_id  uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  seat       integer not null,
  joined_at  timestamptz not null default now(),
  primary key (match_id, player_id),
  -- Two players can never end up sharing a seat.
  unique (match_id, seat)
);

create table if not exists yahtzee.match_moves (
  match_id   uuid not null references yahtzee.matches(id) on delete cascade,
  seq        integer not null,
  seat       integer not null,
  type       text not null check (type in ('roll', 'hold', 'score')),
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  -- The heart of the concurrency model: the sequence number is part of the
  -- primary key, so two devices racing to submit the same move cannot both
  -- win. The loser gets a unique violation, refetches, and reconsiders.
  primary key (match_id, seq)
);

create index if not exists match_players_player_idx on yahtzee.match_players (player_id);
create index if not exists matches_code_idx on yahtzee.matches (code);

-- ------------------------------------------------------------- helpers

-- Whether the current user is seated in a match. Security definer so it can be
-- used inside the policies below without those policies recursing.
create or replace function yahtzee.is_player(target_match uuid)
returns boolean
language sql
security definer
stable
set search_path = yahtzee, public
as $$
  select exists (
    select 1 from yahtzee.match_players
    where match_id = target_match and player_id = auth.uid()
  );
$$;

create or replace function yahtzee.seat_of(target_match uuid)
returns integer
language sql
security definer
stable
set search_path = yahtzee, public
as $$
  select seat from yahtzee.match_players
  where match_id = target_match and player_id = auth.uid();
$$;

-- --------------------------------------------------------------- RLS

alter table yahtzee.matches       enable row level security;
alter table yahtzee.match_players enable row level security;
alter table yahtzee.match_moves   enable row level security;

-- A match is visible to the people playing it. Discovery by code goes through
-- join_match below rather than a broad select, so codes cannot be enumerated.
create policy matches_select on yahtzee.matches
  for select using (yahtzee.is_player(id));

create policy matches_host_update on yahtzee.matches
  for update using (host_id = auth.uid()) with check (host_id = auth.uid());

create policy players_select on yahtzee.match_players
  for select using (yahtzee.is_player(match_id));

create policy moves_select on yahtzee.match_moves
  for select using (yahtzee.is_player(match_id));

-- A player may only append moves for their own seat, in a match that is
-- actually in progress. Whose turn it is cannot be judged here without
-- reimplementing the rules in SQL, so it is enforced by every client when
-- replaying: an out-of-turn move is ignored by all of them, and since dice
-- come from the seed there is nothing to gain by posting one.
create policy moves_insert on yahtzee.match_moves
  for insert with check (
    yahtzee.is_player(match_id)
    and seat = yahtzee.seat_of(match_id)
    and exists (
      select 1 from yahtzee.matches m
      where m.id = match_id and m.status = 'playing'
    )
  );

-- Moves are an append-only record; nothing may rewrite history.
revoke update, delete on yahtzee.match_moves from authenticated;

-- ---------------------------------------------------------------- RPC

create or replace function yahtzee.create_match(p_variant text, p_seed bigint, p_name text)
returns yahtzee.matches
language plpgsql
security definer
set search_path = yahtzee, public
as $$
declare
  new_code  text;
  new_match yahtzee.matches;
  attempts  integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in to create a match';
  end if;

  loop
    -- Excludes characters that are easy to misread aloud: O/0 and I/1.
    new_code := string_agg(
      substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
             floor(random() * 32 + 1)::integer, 1), ''
    ) from generate_series(1, 5);

    begin
      insert into yahtzee.matches (code, host_id, variant, seed)
      values (new_code, auth.uid(), p_variant, p_seed)
      returning * into new_match;
      exit;
    exception when unique_violation then
      attempts := attempts + 1;
      if attempts > 10 then
        raise exception 'Could not allocate a free join code';
      end if;
    end;
  end loop;

  insert into yahtzee.match_players (match_id, player_id, name, seat)
  values (new_match.id, auth.uid(), p_name, 0);

  return new_match;
end;
$$;

create or replace function yahtzee.join_match(p_code text, p_name text)
returns yahtzee.matches
language plpgsql
security definer
set search_path = yahtzee, public
as $$
declare
  target   yahtzee.matches;
  next_seat integer;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in to join a match';
  end if;

  select * into target from yahtzee.matches
  where code = upper(trim(p_code));

  if target.id is null then
    raise exception 'No match with that code';
  end if;

  -- Rejoining an in-progress match is fine; taking a new seat in one is not.
  if exists (
    select 1 from yahtzee.match_players
    where match_id = target.id and player_id = auth.uid()
  ) then
    return target;
  end if;

  if target.status <> 'lobby' then
    raise exception 'That match has already started';
  end if;

  select coalesce(max(seat) + 1, 0) into next_seat
  from yahtzee.match_players where match_id = target.id;

  insert into yahtzee.match_players (match_id, player_id, name, seat)
  values (target.id, auth.uid(), p_name, next_seat);

  return target;
end;
$$;

create or replace function yahtzee.start_match(p_match uuid)
returns void
language plpgsql
security definer
set search_path = yahtzee, public
as $$
begin
  update yahtzee.matches
  set status = 'playing'
  where id = p_match and host_id = auth.uid() and status = 'lobby';

  if not found then
    raise exception 'Only the host can start a match that has not begun';
  end if;
end;
$$;

grant usage on schema yahtzee to authenticated;
grant select on yahtzee.matches, yahtzee.match_players, yahtzee.match_moves to authenticated;
grant insert on yahtzee.match_moves to authenticated;
grant execute on function yahtzee.create_match(text, bigint, text) to authenticated;
grant execute on function yahtzee.join_match(text, text) to authenticated;
grant execute on function yahtzee.start_match(uuid) to authenticated;

-- Live updates for the move log and the lobby.
alter publication supabase_realtime add table yahtzee.match_moves;
alter publication supabase_realtime add table yahtzee.match_players;
alter publication supabase_realtime add table yahtzee.matches;
