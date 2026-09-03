// Edge function: manage-user (admin only)
// action 'update': change a member's username / full name / password.
// action 'delete': permanently delete an account — their created tasks,
// comments, files and routines transfer to the acting admin so records
// survive; their activity-log entries are removed; assignments unassign.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { action, user_id, username, full_name, password } = await req.json()
    if (!user_id || !['update', 'delete'].includes(action)) {
      return json({ error: 'Invalid request' }, 400)
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { db: { schema: 'assignment_office' } },
    )

    // Verify the caller is a signed-in admin
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: caller } = await admin.auth.getUser(token)
    if (!caller?.user) return json({ error: 'Not signed in' }, 401)
    const { data: prof } = await admin.from('profiles').select('role').eq('id', caller.user.id).single()
    if (prof?.role !== 'admin') return json({ error: 'Only an admin can manage accounts' }, 403)

    if (action === 'update') {
      const authUpdates: Record<string, unknown> = {}
      if (username !== undefined) {
        if (!/^[a-z0-9_.-]{3,30}$/.test(username)) {
          return json({ error: 'Username must be 3-30 chars: a-z, 0-9, dot, dash, underscore' }, 400)
        }
        authUpdates.email = `${username}@assignment.local`
        authUpdates.email_confirm = true
      }
      if (password !== undefined && password !== '') {
        if (typeof password !== 'string' || password.length < 6) {
          return json({ error: 'Password must be at least 6 characters' }, 400)
        }
        authUpdates.password = password
      }
      // merge metadata so unrelated keys survive
      const { data: existing } = await admin.auth.admin.getUserById(user_id)
      const meta = { ...(existing?.user?.user_metadata ?? {}) }
      if (username !== undefined) meta.username = username
      if (full_name !== undefined && full_name !== '') meta.full_name = full_name
      authUpdates.user_metadata = meta

      const { error } = await admin.auth.admin.updateUserById(user_id, authUpdates)
      if (error) return json({ error: error.message }, 400)

      const profileUpdates: Record<string, string> = {}
      if (username !== undefined) profileUpdates.username = username
      if (full_name !== undefined && full_name !== '') profileUpdates.full_name = full_name
      if (Object.keys(profileUpdates).length) {
        const { error: pErr } = await admin.from('profiles').update(profileUpdates).eq('id', user_id)
        if (pErr) return json({ error: pErr.message }, 400)
      }
      return json({ ok: true })
    }

    // delete
    if (user_id === caller.user.id) {
      return json({ error: 'You cannot delete your own account' }, 400)
    }
    const me = caller.user.id
    // transfer authored records to the acting admin; drop their activity rows
    await admin.rpc('remove_user_assignments', { target: user_id })
    await admin.from('tasks').update({ created_by: me }).eq('created_by', user_id)
    await admin.from('comments').update({ author_id: me }).eq('author_id', user_id)
    await admin.from('attachments').update({ uploaded_by: me }).eq('uploaded_by', user_id)
    await admin.from('routines').update({ created_by: me }).eq('created_by', user_id)
    await admin.from('routine_completions').update({ completed_by: me }).eq('completed_by', user_id)
    await admin.from('activity').delete().eq('actor_id', user_id)

    const { error } = await admin.auth.admin.deleteUser(user_id)
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
