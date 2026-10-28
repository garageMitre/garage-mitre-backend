// Reparto del pago de un inquilino de terceros (PRIVATE) hacia el propietario de la cochera:
// primero cancela las deudas del propietario, de la más vieja a la más nueva (FIFO, pagando
// parcialmente la última si no alcanza). Lo que sobra después de saldar todas sus deudas es
// plata del propietario y pasa a su crédito, para que la use cuando pague el próximo recibo.
export function allocatePrivatePayment(
  amount: number,
  ownerDebts: number[],
): { applied: number[]; credit: number } {
  let remaining = Math.max(0, amount);
  const applied = ownerDebts.map((debt) => {
    const apply = Math.min(Math.max(0, debt), remaining);
    remaining -= apply;
    return apply;
  });
  return { applied, credit: remaining };
}
