import { supabase, type OpenOrder, type Order, type OrderStatus, type RiderOffer, type Substitution } from '@homecare/shared/lib';
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

/** The automatic offer waiting for this rider, if any (also moves expired offers on). */
export async function myOffer(): Promise<RiderOffer | null> {
  const { data, error } = await supabase.rpc('my_offer');
  if (error) throw error;
  return data?.[0] ?? null;
}

/** Accept (returns the order, now yours) or skip (returns null) an automatic offer. */
export async function respondOffer(offerId: string, accept: boolean): Promise<Order | null> {
  const { data, error } = await supabase.rpc('respond_offer', { p_offer: offerId, p_accept: accept });
  if (error) throw error;
  return data;
}

export async function listSubstitutions(orderId: string): Promise<Substitution[]> {
  const { data, error } = await supabase.from('order_substitutions').select('*').eq('order_id', orderId).order('created_at');
  if (error) throw error;
  return data;
}

export async function requestSubstitution(input: {
  orderId: string;
  item: string;
  suggestion?: string;
  price?: number;
  photoPath?: string;
}): Promise<Substitution> {
  const { data, error } = await supabase.rpc('request_substitution', {
    p_order: input.orderId,
    p_item: input.item,
    p_suggestion: input.suggestion,
    p_price: input.price,
    p_photo_path: input.photoPath,
  });
  if (error) throw error;
  return data;
}

/** Uploads a photo of the item / alternative to order-media/subs/<order id>/<random>.<ext>. */
export async function uploadSubstitutionPhoto(orderId: string, photo: PickedPhoto): Promise<string> {
  const name = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const path = 'subs/' + orderId + '/' + name + '.' + photoExtension(photo.mimeType);
  const { error } = await supabase.storage
    .from('order-media')
    .upload(path, base64ToArrayBuffer(photo.base64), { contentType: photo.mimeType });
  if (error) throw error;
  return path;
}

/** Short-lived links for private order files (voice note, substitution photos). */
export async function fileUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await supabase.storage.from('order-media').createSignedUrls(paths, 600);
  const out: Record<string, string> = {};
  for (const item of data ?? []) if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
  return out;
}
