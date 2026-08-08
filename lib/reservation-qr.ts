const RESERVATION_QR_PREFIX = "exima-pos-reservation:";

export function createReservationQrPayload(reservationId: string) {
  return `${RESERVATION_QR_PREFIX}${reservationId}`;
}

export function parseReservationQrPayload(payload: string): string | null {
  const value = payload.trim();
  if (!value.startsWith(RESERVATION_QR_PREFIX)) return null;

  const reservationId = value.slice(RESERVATION_QR_PREFIX.length).trim();
  return reservationId || null;
}
