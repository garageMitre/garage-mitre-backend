import { ReceiptsService } from './receipts.service';
import { Receipt } from './entities/receipt.entity';
import { Customer } from 'src/customers/entities/customer.entity';

// Tests de createReceipt: la numeración correlativa, el código de barras y la
// asignación del tipo de recibo. El EntityManager va mockeado, así que corre
// sin Postgres.

const OWNERS_MANUALES = [
  'JOSE_RICARDO_AZNAR',
  'CARLOS_ALBERTO_AZNAR',
  'NIDIA_ROSA_MARIA_FONTELA',
  'ALDO_RAUL_FONTELA',
];

type Escenario = {
  customer?: any;
  ultimoRecibo?: any;
};

const cliente = (customerType: string, owners: string[] = []) => ({
  id: 'cliente-1',
  customerType,
  vehicles: [],
  receipts: [],
  vehicleRenters: owners.map((owner) => ({ owner })),
});

const buildManager = (escenario: Escenario) => ({
  findOne: jest.fn((entity: any) =>
    Promise.resolve(entity === Customer ? (escenario.customer ?? null) : null),
  ),
  // El servicio busca el último número con un query builder que encadena
  // setLock/where/andWhere/orderBy antes del getOne.
  createQueryBuilder: jest.fn(() => {
    const qb: any = {};
    for (const metodo of ['setLock', 'where', 'andWhere', 'orderBy']) {
      qb[metodo] = () => qb;
    }
    qb.getOne = () => Promise.resolve(escenario.ultimoRecibo ?? null);
    return qb;
  }),
  create: jest.fn((_entity: any, data: any) => ({ ...data })),
  save: jest.fn((receipt: any) => Promise.resolve(receipt)),
});

const buildService = (): ReceiptsService =>
  new ReceiptsService(
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
  );

const crearRecibo = (escenario: Escenario, price = 50000): Promise<Receipt> =>
  buildService().createReceipt('cliente-1', buildManager(escenario) as any, price);

describe('ReceiptsService · numeración de recibos', () => {
  it('arranca en N° 0000-00000001 cuando no hay recibo previo', async () => {
    const recibo = await crearRecibo({ customer: cliente('OWNER') });

    expect(recibo.receiptNumber).toBe('N° 0000-00000001');
  });

  it('incrementa el correlativo a partir del último recibo', async () => {
    const recibo = await crearRecibo({
      customer: cliente('OWNER'),
      ultimoRecibo: { receiptNumber: 'N° 0000-00000041' },
    });

    expect(recibo.receiptNumber).toBe('N° 0000-00000042');
  });

  it('mantiene el relleno de ceros al cruzar un orden de magnitud', async () => {
    const recibo = await crearRecibo({
      customer: cliente('OWNER'),
      ultimoRecibo: { receiptNumber: 'N° 0000-00000099' },
    });

    expect(recibo.receiptNumber).toBe('N° 0000-00000100');
  });
});

describe('ReceiptsService · código de barras', () => {
  it('genera un código con la forma que el scanner reconoce como recibo', async () => {
    // scanner.service.ts decide si un código es recibo o ticket con
    // /^\d{11,15}$/. Si esta generación cambiara de forma, el escaneo de
    // recibos dejaría de funcionar sin que nada más falle.
    for (let i = 0; i < 25; i++) {
      const recibo = await crearRecibo({ customer: cliente('OWNER') });

      expect(recibo.barcode).toMatch(/^\d{11,15}$/);
      expect([11, 15]).toContain(recibo.barcode.length);
    }
  });
});

describe('ReceiptsService · tipo de recibo', () => {
  it('marca como OWNER a un cliente que no es inquilino', async () => {
    const recibo = await crearRecibo({ customer: cliente('OWNER') });

    expect(recibo.receiptTypeKey).toBe('OWNER');
  });

  it('usa el propietario cuando el inquilino alquila a uno de los conocidos', async () => {
    const recibo = await crearRecibo({
      customer: cliente('RENTER', ['CARLOS_ALBERTO_AZNAR']),
    });

    expect(recibo.receiptTypeKey).toBe('CARLOS_ALBERTO_AZNAR');
    expect(OWNERS_MANUALES).toContain(recibo.receiptTypeKey);
  });

  it('cae en GARAGE_MITRE si el propietario no está en la lista', async () => {
    const recibo = await crearRecibo({
      customer: cliente('RENTER', ['PROPIETARIO_NUEVO']),
    });

    expect(recibo.receiptTypeKey).toBe('GARAGE_MITRE');
  });
});

describe('ReceiptsService · validaciones', () => {
  it('falla si el cliente no existe', async () => {
    await expect(crearRecibo({ customer: null })).rejects.toThrow('Customer not found');
  });
});
