import fp from 'fastify-plugin'
import { FastifyPluginAsync } from 'fastify'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { env } from '../config/env.js'

declare module 'fastify' {
  interface FastifyInstance {
    supabase: SupabaseClient
  }
}

const supabasePlugin: FastifyPluginAsync = fp(async (fastify) => {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  fastify.decorate('supabase', supabase)
})

export default supabasePlugin
