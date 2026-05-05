import { env } from '../config/env.js'
import * as admin from 'firebase-admin'

let initialized = false

/** Initialise Firebase Admin une seule fois et retourne le service Messaging, ou null si non configuré. */
function getMessaging(): admin.messaging.Messaging | null {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_PRIVATE_KEY || !env.FIREBASE_CLIENT_EMAIL) {
    return null
  }

  if (!initialized) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
      }),
    })
    initialized = true
  }

  return admin.messaging()
}

/**
 * Envoie une notification push via Firebase Cloud Messaging.
 * Ne bloque jamais : si Firebase n'est pas configuré ou si le token est invalide, logue et continue.
 */
export async function sendPush(
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  const messaging = getMessaging()
  if (!messaging) return

  try {
    await messaging.send({
      token: fcmToken,
      notification: { title, body },
      ...(data ? { data } : {}),
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    })
  } catch (err: any) {
    console.error('[FCM] Échec envoi push:', err?.code ?? err?.message)
  }
}
