import "dotenv/config";

/**
 * Send push notification to a user's devices via Firebase Cloud Messaging.
 *
 * This uses the FCM HTTP v1 API. To use it:
 * 1. Create a Firebase project
 * 2. Download the service-account JSON
 * 3. Set FCM_SERVER_KEY or GOOGLE_APPLICATION_CREDENTIALS in .env
 *
 * For development, this logs instead of sending.
 */
export async function sendPush(user, title, body, data = {}) {
  if (!user.devices?.length) return;

  const fcmServerKey = process.env.FCM_SERVER_KEY;
  if (!fcmServerKey) {
    console.log(`[push] DEV MODE — Would send to ${user.devices.length} device(s):`, { title, body, data });
    return;
  }

  const messages = user.devices.map(device => ({
    to: device.token,
    notification: { title, body },
    data: { ...data, click_action: 'FLUTTER_NOTIFICATION_CLICK' }
  }));

  try {
    const results = await Promise.allSettled(
      messages.map(msg =>
        fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `key=${fcmServerKey}`
          },
          body: JSON.stringify(msg)
        })
      )
    );

    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length) {
      console.error('[push] Failed sends:', failures.length);
    }
  } catch (err) {
    console.error('[push] Error:', err.message);
  }
}
