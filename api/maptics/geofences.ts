import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { verifyAuth, createGeofence, updateGeofence, deleteGeofence, GeofenceTarget } from '../bizchat/maptics.js';

const geofenceTargetSchema = z.object({
  gender: z.number().min(0).max(2),
  minAge: z.number().min(19).max(90),
  maxAge: z.number().min(19).max(90),
  stayMin: z.number().min(5).max(30),
  radius: z.number().min(50).max(2000),
  address: z.string().min(1),
});

const createGeofenceSchema = z.object({
  name: z.string().min(1),
  target: z.array(geofenceTargetSchema).min(1),
});

const updateGeofenceSchema = z.object({
  targetId: z.number(),
  name: z.string().min(1),
  target: z.array(geofenceTargetSchema).min(1),
});

const deleteGeofenceSchema = z.object({
  targetId: z.number(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await verifyAuth(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    if (req.method === 'POST') {
      const parsed = createGeofenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: '잘못된 요청 형식', details: parsed.error.errors });
      }

      const { name, target } = parsed.data;
      console.log(`[Geofence Create] name=${name}, targets=${target.length}`);
      
      const geofenceId = await createGeofence(name, target as GeofenceTarget[]);
      console.log(`[Geofence Create] Created geofence ID: ${geofenceId}`);

      return res.status(200).json({ id: geofenceId });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const parsed = updateGeofenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: '잘못된 요청 형식', details: parsed.error.errors });
      }

      const { targetId, name, target } = parsed.data;
      console.log(`[Geofence Update] targetId=${targetId}, name=${name}`);
      
      await updateGeofence(targetId, name, target as GeofenceTarget[]);
      console.log(`[Geofence Update] Updated geofence ID: ${targetId}`);

      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const parsed = deleteGeofenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: '잘못된 요청 형식', details: parsed.error.errors });
      }

      const { targetId } = parsed.data;
      console.log(`[Geofence Delete] targetId=${targetId}`);
      
      await deleteGeofence(targetId);
      console.log(`[Geofence Delete] Deleted geofence ID: ${targetId}`);

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[Geofence] Error:', error);
    return res.status(500).json({ error: error.message || '지오펜스 처리 실패' });
  }
}
