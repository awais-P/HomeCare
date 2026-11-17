import { supabase, type Order, type OrderEvent, type SaudaCategory } from '@homecare/shared/lib';
import { base64ToArrayBuffer, photoExtension, type PickedPhoto } from '@homecare/shared/media';

const MEDIA = 'order-media';

export type NewOrder = {
  addressId: string;
  category: SaudaCategory;
  itemsText: string;
  shopPreference?: string;
  instructions?: string;
  photoPaths?: string[];
};

export async function createOrder(input: NewOrder): Promise<Order> {
  const { data, error } = await supabase.rpc('create_sauda_order', {
    p_address_id: input.addressId,
    p_category: input.category,
    p_items_text: input.itemsText,
    p_shop_preference: input.shopPreference,
    p_instructions: input.instructions,
    p_photo_paths: input.photoPaths ?? [],
  });
  if (error) throw error;
  return data;
}

export async function listMyOrders(): Promise<Order[]> {
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return data;
}

export async function getOrder(id: string): Promise<{ order: Order | null; events: OrderEvent[] }> {
  const [{ data: order, error }, { data: events }] = await Promise.all([
    supabase.from('orders').select('*').eq('id', id).maybeSingle(),
    supabase.from('order_events').select('*').eq('order_id', id).order('id'),
  ]);
  if (error) throw error;
  return { order, events: events ?? [] };
}

export async function getContact(orderId: string): Promise<{ name: string | null; phone: string | null } | null> {
  const { data } = await supabase.rpc('order_contact', { p_order: orderId });
  return data?.[0] ?? null;
}

export async function cancelOrder(orderId: string, reason?: string): Promise<Order> {
  const { data, error } = await supabase.rpc('cancel_order', { p_order: orderId, p_reason: reason });
  if (error) throw error;
  return data;
}

export async function rateOrder(orderId: string, rating: number, comment?: string): Promise<Order> {
  const { data, error } = await supabase.rpc('rate_order', { p_order: orderId, p_rating: rating, p_comment: comment });
  if (error) throw error;
  return data;
}

/** Uploads a photo of the shopping list to order-media/<user id>/<random>.<ext>. */
export async function uploadListPhoto(userId: string, photo: PickedPhoto): Promise<string> {
  const path = `${userId}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${photoExtension(photo.mimeType)}`;
  const { error } = await supabase.storage
    .from(MEDIA)
    .upload(path, base64ToArrayBuffer(photo.base64), { contentType: photo.mimeType });
  if (error) throw error;
  return path;
}

/** Short-lived links for private order photos (list photos, bill). */
export async function photoUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await supabase.storage.from(MEDIA).createSignedUrls(paths, 600);
  const out: Record<string, string> = {};
  for (const item of data ?? []) if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
  return out;
}

/** Fee of the first distance band ("from Rs …"), from the business settings. */
export async function baseDeliveryFee(): Promise<number | null> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'delivery_fee_bands').maybeSingle();
  const bands = data?.value as { fee: number }[] | undefined;
  return bands?.[0]?.fee ?? null;
}

/** Fee charged when a customer cancels after a rider accepted, from the business settings. */
export async function cancellationFee(): Promise<number> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'cancellation').maybeSingle();
  return (data?.value as { fee_after_accept?: number } | undefined)?.fee_after_accept ?? 0;
}

/** Maps order errors from the database to message keys. */
export function orderErrorKey(error: unknown) {
  const message = (error as { message?: string })?.message ?? '';
  if (message.includes('too_many_active_orders')) return 'order.errors.tooMany' as const;
  if (message.includes('outside_service_area')) return 'address.errors.outside' as const;
  if (message.includes('contact_support_to_cancel')) return 'order.detail.cancelSupport' as const;
  return null;
}
