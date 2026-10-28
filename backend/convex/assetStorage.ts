import { R2 } from '@convex-dev/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { components } from './_generated/api';
import { env } from './_generated/server';

export const storage = new R2(components.r2, {
  bucket: env.R2_BUCKET,
  endpoint: env.R2_ENDPOINT,
  accessKeyId: env.R2_ACCESS_KEY_ID,
  secretAccessKey: env.R2_SECRET_ACCESS_KEY,
});

export async function uploadUrl(file: { key: string; mimeType: string; size: number }) {
  return getSignedUrl(
    storage.client,
    new PutObjectCommand({
      Bucket: storage.config.bucket,
      Key: file.key,
      ContentType: file.mimeType,
      ContentLength: file.size,
      IfNoneMatch: '*',
    }),
    { expiresIn: 900, signableHeaders: new Set(['content-type', 'if-none-match']) },
  );
}
