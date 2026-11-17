import { supabase, type OpenOrder, type Order, type OrderStatus } from '@homecare/shared/lib';
import { base64ToArrayBuffer, photoExtension, type PickedPhoto } from '@homecare/shared/media';

export async function listOpenOrders(lat: number, lng: number): Promise<OpenOrder[]> {
  const { data, error } = await supabase.rpc('list_open_orders', { lat, lng });
  if (error) throw error;
  return data ?? [];
}

export async function acceptOrder(orderId: string): Promise<Order> {
  const { data, error } = await supabase.rpc('accept_order', { p_order: orderId });
  if (error) throw error;
  return data;
}

/** The rider's order in progress, if any. */
export async function myActiveOrder(riderId: string): Promise<Order | null> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('rider_id', riderId)
    .in('status', ['accepted', 'at_shop', 'on_the_way'])
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getOrder(orderId: string): Promise<Order | null> {
  const { data, error } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function advanceOrder(
  orderId: string,
  next: OrderStatus,
  extra: { lat?: number; lng?: number; itemCost?: number; billPhotoPath?: string } = {},
): Promise<Order> {
  const { data, error } = await supabase.rpc('advance_order', {
    p_order: orderId,
    p_next: next,
    lat: extra.lat,
    lng: extra.lng,
    p_item_cost: extra.itemCost,
    p_bill_photo_path: extra.billPhotoPath,
  });
  if (error) throw error;
  return data;
}

/** Gives the order back (only before reaching the shop). */
export async function releaseOrder(orderId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_order', { p_order: orderId, p_reason: 'Rider released the order' });
  if (error) throw error;
}

export async function getCustomerContact(orderId: string) {
  const { data } = await supabase.rpc('order_contact', { p_order: orderId });
  return data?.[0] ?? null;
}

/** Uploads the bill photo to order-media/bills/<order id>.<ext> and returns its path. */
export async function uploadBill(orderId: string, photo: PickedPhoto): Promise<string> {
  const path = `bills/${orderId}.${photoExtension(photo.mimeType)}`;
  const { error } = await supabase.storage
    .from('order-media')
    .upload(path, base64ToArrayBuffer(photo.base64), { contentType: photo.mimeType, upsert: true });
  if (error) throw error;
  return path;
}

export async function cashLimit(): Promise<number> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'rider_cash_limit').maybeSingle();
  return Number(data?.value ?? 5000);
}
