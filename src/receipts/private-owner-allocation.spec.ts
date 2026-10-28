import { allocatePrivatePayment } from './private-owner-allocation';

describe('allocatePrivatePayment · pago de inquilino de terceros al propietario', () => {
  it('salda la deuda y el sobrante pasa al crédito del propietario', () => {
    // Paga $70.000, el propietario debe $45.000 y ningún otro mes.
    expect(allocatePrivatePayment(70000, [45000])).toEqual({ applied: [45000], credit: 25000 });
  });

  it('antes de dar crédito cubre los otros meses que deba, del más viejo al más nuevo', () => {
    expect(allocatePrivatePayment(70000, [45000, 20000, 30000])).toEqual({
      applied: [45000, 20000, 5000],
      credit: 0,
    });
  });

  it('si no alcanza, paga parcialmente y no genera crédito', () => {
    expect(allocatePrivatePayment(30000, [45000])).toEqual({ applied: [30000], credit: 0 });
  });

  it('sin deudas del propietario, todo el pago pasa a su crédito', () => {
    expect(allocatePrivatePayment(70000, [])).toEqual({ applied: [], credit: 70000 });
  });

  it('ignora recibos sin saldo', () => {
    expect(allocatePrivatePayment(10000, [0, 4000])).toEqual({ applied: [0, 4000], credit: 6000 });
  });
});
