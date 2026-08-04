// Edge function: create-user
// Lets an admin create team member accounts (username + password, no email).
// Runs with the service role, but only after verifying the caller is an
// admin of Assignment Office.
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
    const { username, password, full_name } = await req.json()

    if (!/^[a-z0-9_.-]{3,30}$/.test(username ?? '')) {
      return json({ error: 'Username must be 3-30 chars: a-z, 0-9, dot, dash, underscore' }, 400)
    }
    if (typeof password !== 'string' || password.length < 6) {
      return json({ error: 'Password must be at least 6 characters' }, 400)
    }
    if (typeof full_name !== 'string' || !full_name.trim()) {
      return json({ error: 'Full name is required' }, 400)
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
    if (prof?.role !== 'admin') return json({ error: 'Only an admin can create accounts' }, 403)

    const { data, error } = await admin.auth.admin.createUser({
      email: `${username}@assignment.local`,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name.trim(), username },
    })
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true, id: data.user.id })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
