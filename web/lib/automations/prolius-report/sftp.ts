import SftpClient from "ssh2-sftp-client";
import { resolveCredentials } from "@/lib/credentials/proxy";

const COUCHDROP_CREDENTIAL_ID = "0fdacf68-14fb-4c88-93b9-3dc5a093e6ae";
const UPLOAD_DIR = "/uk_track_and_trace";

/**
 * Upload a file buffer to CouchDrop SFTP in the /uk_track_and_trace/ directory.
 * Credentials are resolved from Supabase encrypted credential store.
 */
export async function uploadToCouchDrop(
  buffer: Buffer,
  filename: string,
): Promise<void> {
  const creds = await resolveCredentials(COUCHDROP_CREDENTIAL_ID);
  const sftp = new SftpClient();

  try {
    await sftp.connect({
      host: creds.host,
      port: 22,
      username: creds.username,
      password: creds.password,
    });

    const remotePath = `${UPLOAD_DIR}/${filename}`;
    await sftp.put(buffer, remotePath);

    console.log(`Uploaded ${filename} to CouchDrop at ${remotePath}`);
  } finally {
    await sftp.end();
  }
}
