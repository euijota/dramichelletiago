drop policy if exists "Anyone can request an appointment" on public.appointments;
revoke insert on public.appointments from anon, authenticated;

revoke all on function public.booked_times(date) from anon, authenticated, public;
revoke all on function public.has_role(uuid, public.app_role) from anon, authenticated, public;
revoke all on function public.handle_new_user() from anon, authenticated, public;

create policy "No self role assignment" on public.user_roles
  for insert to authenticated with check (false);
create policy "No self role update" on public.user_roles
  for update to authenticated using (false) with check (false);
create policy "No self role delete" on public.user_roles
  for delete to authenticated using (false);