import { Router } from 'express';
import { z } from 'zod';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AuthenticatedRequest } from '../../middleware/auth';

const BLOCKED_MIME_TYPES = new Set([
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-sh',
  'application/x-bat',
  'application/x-powershell',
  'application/x-executable',
]);

const BLOCKED_EXTENSIONS = /\.(exe|sh|bat|cmd|ps1|msi|dll|so|dylib|app|deb|rpm)$/i;

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const presignSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mime_type: z.string().trim().min(1).max(120),
  size_bytes: z.number().int().min(1).max(MAX_SIZE_BYTES),
  message_id: z.string().uuid().optional(),
});

function getR2Client(env: NodeJS.ProcessEnv) {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('R2 credentials not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)');
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
}

export function createUploadRouter(
  requirePermission: (p: string) => import('express').RequestHandler,
): import('express').Router {
  const router = Router();

  // POST /messaging/upload/presign
  router.post('/presign', requirePermission('messaging:send'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const body = presignSchema.parse(req.body);

      // Block dangerous file types
      if (BLOCKED_MIME_TYPES.has(body.mime_type) || BLOCKED_EXTENSIONS.test(body.filename)) {
        res.status(400).json({ data: null, error: { code: 'BLOCKED_TYPE', message: 'File type not allowed' } });
        return;
      }

      const bucket = process.env['R2_BUCKET_NAME'];
      if (!bucket) {
        res.status(503).json({ data: null, error: { code: 'STORAGE_NOT_CONFIGURED', message: 'File storage not configured' } });
        return;
      }

      const r2Key = `messaging/${workspace.id}/${Date.now()}-${body.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const client = getR2Client(process.env);

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: r2Key,
        ContentType: body.mime_type,
        ContentLength: body.size_bytes,
      });

      const presignedUrl = await getSignedUrl(client, command, { expiresIn: 300 }); // 5 min

      res.json({
        data: {
          upload_url: presignedUrl,
          r2_key: r2Key,
          filename: body.filename,
          mime_type: body.mime_type,
          size_bytes: body.size_bytes,
        },
        error: null,
      });
    } catch (err) { next(err); }
  });

  return router;
}
