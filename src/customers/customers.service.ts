import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateCustomerDto, CreateVehicleDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, ILike, In, QueryFailedError, Raw, Repository } from 'typeorm';
import { Customer, CustomerType } from './entities/customer.entity';
import { ReceiptsService } from 'src/receipts/receipts.service';
import { addMonths, startOfMonth } from 'date-fns';
import { FilterOperator, paginate, Paginated, PaginateQuery } from 'nestjs-paginate';
import { Receipt } from 'src/receipts/entities/receipt.entity';
import { Vehicle } from './entities/vehicle.entity';
import { InterestSettings } from './entities/interest-setting.entity';
import { CreateInterestSettingDto } from './dto/interest-setting.dto';
import { Cron } from '@nestjs/schedule';
import { isUUID } from 'class-validator';
import { UpdateAmountAllCustomerDto } from './dto/update-amount-all-customers.dto';
import { ParkingType } from './entities/parking-type.entity';
import { CreateParkingTypeDto } from './dto/create-parking-type.dto';
import { UpdateParkingTypeDto } from './dto/update-parking-type.dto';

import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import * as isBetween from 'dayjs/plugin/isBetween'; 
import { NotificationGateway } from 'src/notes/notification-gateway';
import { v4 as uuidv4 } from 'uuid'; 
import { NotificationInterestGateway } from './notification-interest-gateway';
import { VehicleRenter } from './entities/vehicle-renter.entity';
import { error } from 'console';


dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isBetween);

@Injectable()
export class CustomersService {
    private readonly logger = new Logger(CustomersService.name);
    
    constructor(
      @InjectRepository(Customer)
      private readonly customerRepository: Repository<Customer>,
      @InjectRepository(Vehicle)
      private readonly vehicleRepository: Repository<Vehicle>,
      @InjectRepository(VehicleRenter)
      private readonly vehicleRenterRepository: Repository<VehicleRenter>,
      @InjectRepository(ParkingType)
      private readonly parkingTypeRepository: Repository<ParkingType>,
      @InjectRepository(Receipt)
      private readonly receiptRepository: Repository<Receipt>,
      @InjectRepository(InterestSettings)
      private readonly interestSettingsRepository: Repository<InterestSettings>,
      private readonly receiptsService: ReceiptsService,
      private readonly notificationGateway: NotificationInterestGateway,
      private readonly dataSource: DataSource,
    ) {}

    async create(createCustomerDto: CreateCustomerDto) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
    
      try {
        const customerRepo = queryRunner.manager.getRepository(Customer);
        const vehicleRepo = queryRunner.manager.getRepository(Vehicle);
        const vehicleRenterRepo = queryRunner.manager.getRepository(VehicleRenter);
        const parkingTypeRepo = queryRunner.manager.getRepository(ParkingType);
    
        const customer = customerRepo.create({
          ...createCustomerDto,
          vehicles: [],
          vehicleRenters: []
        });
        const manualOwners = [
          'JOSE_RICARDO_AZNAR',
          'CARLOS_ALBERTO_AZNAR',
          'NIDIA_ROSA_MARIA_FONTELA',
          'ALDO_RAUL_FONTELA',
        ];

    
        const argentinaTime = dayjs().tz('America/Argentina/Buenos_Aires');
        const nextMonthStartDate = argentinaTime
        .startOf('month')
        .add(1, 'day') 
        .tz('America/Argentina/Buenos_Aires')
        .format('YYYY-MM-DD');

        customer.startDate = nextMonthStartDate;
        const savedCustomer = await customerRepo.save(customer);
          if (createCustomerDto.hasDebt) {
            let parsedMonthsDebt: { month: string; amount?: number }[];

            try {
              parsedMonthsDebt = Array.isArray(createCustomerDto.monthsDebt)
                ? createCustomerDto.monthsDebt
                : JSON.parse(createCustomerDto.monthsDebt);
            } catch (err) {
              throw new BadRequestException('Formato inválido para monthsDebt');
            }

            // Validar formato de cada elemento
            for (const d of parsedMonthsDebt) {
              if (!d.month || typeof d.month !== 'string') {
                throw new BadRequestException('Cada elemento en monthsDebt debe tener un mes válido');
              }
            }

            const minMonth = parsedMonthsDebt
              .map((d) => dayjs(d.month.length === 7 ? `${d.month}-01` : d.month))
              .sort((a, b) => a.unix() - b.unix())[0]
              .format('YYYY-MM-DD');

            savedCustomer.startDate = minMonth;
            savedCustomer.monthsDebt = parsedMonthsDebt;

            await queryRunner.manager.save(savedCustomer);

            for (const debt of parsedMonthsDebt) {

              await this.receiptsService.createReceipt(
                savedCustomer.id,
                queryRunner.manager,
                debt.amount,
                null,
                debt.month.length === 7 ? `${debt.month}-01` : debt.month,
              );
            }
          }


        const vehicles = [];
        const vehiclesRenter = [];
    
        if (customer.customerType === 'OWNER' && createCustomerDto.vehicles?.length > 0 ||
            customer.customerType !== 'OWNER' && createCustomerDto.vehicleRenters?.length > 0) {
          
          if (customer.customerType === 'OWNER') {
            for (const vehicleDto of createCustomerDto.vehicles) {
              const parkingType = await parkingTypeRepo.findOne({
                where: { parkingType: vehicleDto.parking },
              });
    
              if (!parkingType) {
                throw new NotFoundException({
                  code: 'PARKING_TYPE_NOT_FOUND',
                  message: 'Parking type not found',
                });
              }
              const normalizedGarageNumber = vehicleDto.garageNumber.replace(/\s/g, '').toLowerCase();

              const existingGarageNumberOwner = await vehicleRepo.findOne({
                where: {
                  garageNumber: Raw((alias) => `LOWER(REPLACE(${alias}, ' ', '')) = '${normalizedGarageNumber}'`),
                },
              });
              
              const existingGarageNumberRenter = await vehicleRenterRepo.findOne({
                where: {
                  garageNumber: Raw((alias) => `LOWER(REPLACE(${alias}, ' ', '')) = '${normalizedGarageNumber}'`),
                },
              });
    
              if (
                vehicleDto.garageNumber !== "" &&
                (existingGarageNumberOwner || existingGarageNumberRenter)
              ) {
                throw new NotFoundException({
                  code: 'GARAGE_NUMBER_ALREADY_EXIST',
                  message: `El número de garage ${vehicleDto.garageNumber} ya se encuentra en uso`,
                });
              }
    
              const vehicle = vehicleRepo.create({
                ...vehicleDto,
                parkingType,
                amount: parkingType.amount,
                customer: savedCustomer,
              });
    
              vehicles.push(vehicle);
            }
            await vehicleRepo.save(vehicles);
    
          } else {
            for (const vehicleRenterDto of createCustomerDto.vehicleRenters) {
              if(vehicleRenterDto.owner !== ""){
                if (!manualOwners.includes(vehicleRenterDto.owner)) {
                  const vehicleOwner = await vehicleRepo.findOne({
                    where: { id: vehicleRenterDto.owner },
                    relations: ['customer'],
                  });
      
                  if (!vehicleOwner) {
                    throw new NotFoundException('Vehicle not found');
                  }
      
                  const normalizedGarageNumber = vehicleRenterDto.garageNumber.replace(/\s/g, '').toLowerCase();

                  const existingGarageNumberOwner = await vehicleRepo.findOne({
                    where: {
                      garageNumber: Raw((alias) => `LOWER(REPLACE(${alias}, ' ', '')) = '${normalizedGarageNumber}'`),
                    },
                  });
                  
                  const existingGarageNumberRenter = await vehicleRenterRepo.findOne({
                    where: {
                      garageNumber: Raw((alias) => `LOWER(REPLACE(${alias}, ' ', '')) = '${normalizedGarageNumber}'`),
                    },
                  });
      
                  if (
                    vehicleRenterDto.garageNumber !== "" &&
                    (existingGarageNumberOwner || existingGarageNumberRenter)
                  ) {
                    throw new NotFoundException({
                      code: 'GARAGE_NUMBER_ALREADY_EXIST',
                      message: `El número de garage ${vehicleRenterDto.garageNumber} ya se encuentra en uso`,
                    });
                  }
                  
      
                  const vehicle = vehicleRenterRepo.create({
                    customer: savedCustomer,
                    vehicle: vehicleOwner,
                    amount: vehicleOwner.amountRenter || 0,
                    garageNumber: vehicleOwner.garageNumber,
                    owner: vehicleRenterDto.owner
                  });
      
                  vehicleOwner.rentActive = true;
                  await vehicleRepo.save(vehicleOwner);
      
                  vehiclesRenter.push(vehicle);
                } else {
                  const normalizedGarageNumber = vehicleRenterDto.garageNumber.replace(/\s/g, '').toLowerCase();

                  const existingGarageNumberOwner = await vehicleRepo.findOne({
                    where: {
                      garageNumber: Raw((alias) => `LOWER(REPLACE(${alias}, ' ', '')) = '${normalizedGarageNumber}'`),
                    },
                  });
                  
                  const existingGarageNumberRenter = await vehicleRenterRepo.findOne({
                    where: {
                      garageNumber: Raw((alias) => `LOWER(REPLACE(${alias}, ' ', '')) = '${normalizedGarageNumber}'`),
                    },
                  });
      
                  if (existingGarageNumberOwner || existingGarageNumberRenter && vehicleRenterDto.garageNumber !== "") {
                    throw new NotFoundException({
                      code: 'GARAGE_NUMBER_ALREADY_EXIST',
                      message: `El número de garage ${vehicleRenterDto.garageNumber} ya se encuentra en uso`,
                    });
                  }
      
                  const vehicle = vehicleRenterRepo.create({
                    ...vehicleRenterDto,
                    customer: savedCustomer,
                  });
      
                  vehiclesRenter.push(vehicle);
                }

              }
            }
            await vehicleRenterRepo.save(vehiclesRenter);
          }
        }
    
        // ⚡️ Acá calculamos bien
        const totalVehicleAmount =
          customer.customerType === 'OWNER'
            ? vehicles.reduce((acc, vehicle) => acc + (vehicle.amount || 0), 0)
            : vehiclesRenter.reduce((acc, vehicle) => acc + (vehicle.amount || 0), 0);
    
            let shouldCreateReceipt = true;

            if (customer.customerType !== 'OWNER') {
              // Si es RENTER, verificar si alguno de los vehicleRenters tiene owner vacío
              shouldCreateReceipt = createCustomerDto.vehicleRenters?.every(vr => vr.owner !== '');
            }
            
            if (shouldCreateReceipt) {
              await this.receiptsService.createReceipt(savedCustomer.id, queryRunner.manager, totalVehicleAmount);
            }

const customers = await customerRepo.find();

customers.forEach(c => c.startDate = nextMonthStartDate);

await customerRepo.save(customers);

await this.receiptRepository.delete({
  startDate: Between('2025-04-01', '2025-05-31'),
});

    
        await queryRunner.commitTransaction();
        return savedCustomer;
      } catch (error) {
        await queryRunner.rollbackTransaction();
        console.error(error.stack);
        this.logger.error(error.message, error.stack);
        throw error;
      } finally {
        await queryRunner.release();
      }
    }
    

  async findAll(customer: CustomerType){
    try {
      const customers = await this.customerRepository.find({
        relations: ['receipts','vehicles','vehicles.parkingType','vehicleRenters', 'vehicles.vehicleRenters', 'vehicleRenters.customer', 'vehicleRenters.vehicle', 'vehicleRenters.vehicle.customer'],
        where: {customerType : customer},
        withDeleted: true
      })

        return customers;
    } catch (error) {
      this.logger.error(error.message, error.stack);
    }
  }

  async findOne(id: string) {
    try {
      const customer = await this.customerRepository.findOne({
        where: { id },
        relations: ['receipts','vehicles','vehicles.parkingType','vehicleRenters', 'vehicles.vehicleRenters', 'vehicleRenters.customer', 'vehicleRenters.vehicle', 'vehicleRenters.vehicle.customer'],
        withDeleted: true
      });
  
      if (!customer) {
        throw new NotFoundException(`Customer not found`);
      }
  
      // Ordenar los receipts para que "PENDING" siempre esté al final
      customer.receipts = customer.receipts.sort((a, b) => {
        if (a.status === 'PENDING' && b.status !== 'PENDING') return 1;
        if (a.status !== 'PENDING' && b.status === 'PENDING') return -1;
        return new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime(); // Ordenar por fecha descendente
      });
  
      return customer;
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(error.message, error.stack);
      }
      throw error;
    }
  }
  
  async update(id: string, updateCustomerDto: UpdateCustomerDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
  
    try {
      
      const customerRepo = queryRunner.manager.getRepository(Customer);
      const vehicleRepo = queryRunner.manager.getRepository(Vehicle);
      const vehicleRenterRepo = queryRunner.manager.getRepository(VehicleRenter);
      const parkingTypeRepo = queryRunner.manager.getRepository(ParkingType);
      const receiptRepo = queryRunner.manager.getRepository(Receipt); // importante
  
      const customer = await customerRepo.findOne({
        where: { id },
        relations: ['vehicles', 'receipts', 'vehicleRenters'],
      });
  
      if (!customer) {
        throw new NotFoundException(`Customer ${id} not found`);
      }
    

      const manualOwners = [
        'JOSE_RICARDO_AZNAR',
        'CARLOS_ALBERTO_AZNAR',
        'NIDIA_ROSA_MARIA_FONTELA',
        'ALDO_RAUL_FONTELA',
      ];
      
      // Desactivar rentActive de vehículos rentados
      if (customer.vehicleRenters.length > 0) {
        for (const vehicleRenter of customer.vehicleRenters) {
          if (!manualOwners.includes(vehicleRenter.owner)) {
            const vehicleOwner = await vehicleRepo.findOne({
              where: { id: vehicleRenter.owner },
            });
  
            if (!vehicleOwner) {
              throw new NotFoundException('Vehicle not found');
            }
  
            if (vehicleOwner.rent === true) {
              vehicleOwner.rentActive = false;
              await queryRunner.manager.save(vehicleOwner);
            }
          }
        }
        await queryRunner.manager.remove(VehicleRenter, customer.vehicleRenters);
        customer.vehicleRenters = [];

      }
  
      if (
        (customer.customerType === 'OWNER' && updateCustomerDto.vehicles?.length > 0) ||
        (customer.customerType !== 'OWNER' && updateCustomerDto.vehicleRenters?.length > 0)
      ) {
        const vehicles = [];
        const vehiclesRenter = [];
      
        if (customer.customerType === 'OWNER') {
          const existingVehicles = await vehicleRepo.find({
            where: { customer: { id: customer.id } },
            relations: ['vehicleRenters'],
          });
          
          // Crear el mapa para lookup rápido por id
          const existingVehiclesMap = new Map(
            existingVehicles.map((vehicle) => [vehicle.id, vehicle]),
          );
          
          for (const vehicleDto of updateCustomerDto.vehicles) {
            if (!vehicleDto.id) {
            // CREAR VEHÍCULO NUEVO
            const parkingType = await parkingTypeRepo.findOne({
              where: { parkingType: vehicleDto.parking },
            });

            if (!parkingType) {
              throw new NotFoundException({
                code: 'PARKING_TYPE_NOT_FOUND',
                message: 'Parking type not found',
              });
            }
            const normalizedGarageNumber = vehicleDto.garageNumber.replace(/\s/g, '').toLowerCase();

            const existingGarageNumberOwner = await vehicleRepo.findOne({
              where: {
                garageNumber: Raw((alias) => `LOWER(REPLACE(${alias}, ' ', '')) = '${normalizedGarageNumber}'`),
              },
            });
            
            const existingGarageNumberRenter = await vehicleRenterRepo.findOne({
              where: {
                garageNumber: Raw((alias) => `LOWER(REPLACE(${alias}, ' ', '')) = '${normalizedGarageNumber}'`),
              },
            });

            if (
              vehicleDto.garageNumber !== "" &&
              (existingGarageNumberOwner || existingGarageNumberRenter)
            ) {
              throw new NotFoundException({
                code: 'GARAGE_NUMBER_ALREADY_EXIST',
                message: `El número de garage ${vehicleDto.garageNumber} ya se encuentra en uso`,
              });
            }

            const newVehicle = queryRunner.manager.create(Vehicle, {
              garageNumber: vehicleDto.garageNumber,
              rent: vehicleDto.rent,
              parkingType,
              amount: parkingType.amount,
              amountRenter: vehicleDto.amountRenter,
              customer: customer,
            });

            await queryRunner.manager.save(Vehicle, newVehicle);
            vehicles.push(newVehicle);

            continue; // 👉 seguimos al próximo vehicleDto
          }
            const oldVehicle = existingVehiclesMap.get(vehicleDto.id);
          
            if (!oldVehicle) {
              throw new NotFoundException({
                code: 'VEHICLE_NOT_FOUND',
                message: 'Vehículo anterior no encontrado',
              });
            }
          
            const parkingType = await parkingTypeRepo.findOne({
              where: { parkingType: vehicleDto.parking },
            });
          
            if (!parkingType) {
              throw new NotFoundException({
                code: 'PARKING_TYPE_NOT_FOUND',
                message: 'Parking type not found',
              });
            }
            const normalizedGarageNumber = vehicleDto.garageNumber.replace(/\s/g, '').toLowerCase();

            const existingGarageNumberOwner = await vehicleRepo.findOne({
              where: {
                garageNumber: Raw((alias) => `LOWER(REPLACE(${alias}, ' ', '')) = '${normalizedGarageNumber}'`),
              },
            });
            
            const existingGarageNumberRenter = await vehicleRenterRepo.findOne({
              where: {
                garageNumber: Raw((alias) => `LOWER(REPLACE(${alias}, ' ', '')) = '${normalizedGarageNumber}'`),
              },
            });

            if (
              oldVehicle.garageNumber !== vehicleDto.garageNumber && vehicleDto.garageNumber !== "" &&
              (existingGarageNumberOwner || existingGarageNumberRenter)
            ) {
              throw new NotFoundException({
                code: 'GARAGE_NUMBER_ALREADY_EXIST',
                message: `El número de garage ${vehicleDto.garageNumber} ya se encuentra en uso`,
              });
            }

            if (!parkingType) {
              throw new NotFoundException({
                code: 'PARKING_TYPE_NOT_FOUND',
                message: 'Parking type not found',
              });
            }
          
            if (oldVehicle.rent === true && vehicleDto.rent === false && oldVehicle.vehicleRenters.length > 0) {
              throw new NotFoundException({
                code: 'CUSTOMER_RENTER_RELATIONSHIP',
                message: `El vehiculo del garage (${oldVehicle.garageNumber}) ya tiene un inquilino relacionado. Porfavor si desea cambiar esta opcion cambie
                          el garage del inquilino relacionado`,
              });
            }
          
            const newVehicle = queryRunner.manager.create(Vehicle, {
              garageNumber: vehicleDto.garageNumber,
              rent: vehicleDto.rent,
              parkingType,
              amount: parkingType.amount,
              amountRenter: vehicleDto.amountRenter,
              customer: customer,
            });
          
            await queryRunner.manager.save(Vehicle, newVehicle);
            vehicles.push(newVehicle);
          
            if (oldVehicle?.vehicleRenters?.length > 0) {
              for (const renter of oldVehicle.vehicleRenters) {
                const findVehicleRenter = await vehicleRenterRepo.findOne({
                  where: { id: renter.id },
                });
                if (!findVehicleRenter) {
                  throw new NotFoundException('Vehicle renter not found');
                }
          
                findVehicleRenter.amount = vehicleDto.amountRenter;
                findVehicleRenter.garageNumber = vehicleDto.garageNumber;
                findVehicleRenter.vehicle = newVehicle;
                findVehicleRenter.owner = newVehicle.id;
                newVehicle.rentActive = true;
                await queryRunner.manager.save(Vehicle, newVehicle);

          
                await queryRunner.manager.save(findVehicleRenter);
              }
            }
          
            const fullOldVehicle = await vehicleRepo.findOne({
              where: { id: oldVehicle.id },
              relations: ['vehicleRenters'],
            });
          
            await queryRunner.manager.remove(Vehicle, fullOldVehicle);
          }
          
          // 👉 RELACIONAR VEHÍCULOS AL CUSTOMER
          customer.vehicles = vehicles;
          await queryRunner.manager.save(customer);
          
        }
         else {
          for (const vehicleRenterDto of updateCustomerDto.vehicleRenters) {
            if(vehicleRenterDto.owner !== ""){
              if (!manualOwners.includes(vehicleRenterDto.owner)) {
                const vehicleOwner = await vehicleRepo.findOne({
                  where: { id: vehicleRenterDto.owner },
                  relations: ['customer'],
                });
    
                if (!vehicleOwner) throw new NotFoundException('vehicle not found');
                
    
                const vehicle = vehicleRenterRepo.create({
                  customer: customer,
                  vehicle: vehicleOwner,
                  amount: vehicleOwner.amountRenter || 0,
                  garageNumber: vehicleOwner.garageNumber,
                  owner: vehicleRenterDto.owner,
                });
    
                vehicleOwner.rentActive = true;
                await queryRunner.manager.save(vehicleOwner);
                customer.vehicleRenters.push(vehicle)
  
    
                vehiclesRenter.push(vehicle);
              } else {
                
                const normalizedGarageNumber = vehicleRenterDto.garageNumber.replace(/\s/g, '').toLowerCase();

                const existingGarageNumberOwner = await vehicleRepo.findOne({
                  where: {
                    garageNumber: Raw((alias) => `LOWER(REPLACE(${alias}, ' ', '')) = '${normalizedGarageNumber}'`),
                  },
                });
                
                const existingGarageNumberRenter = await vehicleRenterRepo.findOne({
                  where: {
                    garageNumber: Raw((alias) => `LOWER(REPLACE(${alias}, ' ', '')) = '${normalizedGarageNumber}'`),
                  },
                });
  
                
            if (
              vehicleRenterDto.garageNumber !== "" &&
              (existingGarageNumberOwner || existingGarageNumberRenter)
            ){
                  throw new NotFoundException({
                    code: 'GARAGE_NUMBER_ALREADY_EXIST',
                    message: `El número de garage ${vehicleRenterDto.garageNumber} ya se encuentra en uso`,
                  });
                }
                
                
                const vehicle = vehicleRenterRepo.create({
                  ...vehicleRenterDto,
                  customer: customer,
                });
                customer.vehicleRenters.push(vehicle)
    
                vehiclesRenter.push(vehicle);
              }
            }
          }
  
          await queryRunner.manager.save(vehiclesRenter);
        }
      }
  
      // Actualizar Customer

  
      // Actualizar recibo si está pendiente
      const totalVehicleAmount = customer.vehicles?.length
        ? customer.vehicles.reduce((acc, vehicle) => acc + (vehicle.amount || 0), 0)
        : customer.vehicleRenters.reduce((acc, vehicle) => acc + (vehicle.amount || 0), 0);
  
      const price = totalVehicleAmount;
      const oldMonthsDebtCustoemr = customer.monthsDebt;
      const { vehicles, vehicleRenters, ...customerData } = updateCustomerDto;
      customerRepo.merge(customer, customerData);
      const savedCustomer = await queryRunner.manager.save(customer);
  
      const receipts = await receiptRepo.find({
        where: { customer: { id: customer.id }, status: 'PENDING' },
      });

      for(const receipt of receipts){
        receipt.price = price;
        await queryRunner.manager.save(receipt);
      }

      if (updateCustomerDto.hasDebt) {
        const normalizeMonth = (month: string) =>
          month.length === 7 ? `${month}-01` : month;
        const prevMonths = (oldMonthsDebtCustoemr || []).map(m =>
          normalizeMonth(m.month)
        );

        const newMonthsDebt = Array.isArray(updateCustomerDto.monthsDebt)
          ? updateCustomerDto.monthsDebt
          : JSON.parse(updateCustomerDto.monthsDebt);

        const dtoMonths = newMonthsDebt.map(m => normalizeMonth(m.month));
        const dtoMonthsSet = new Set(dtoMonths);

        const receiptRepoTxn = queryRunner.manager.getRepository(Receipt);

        // for (const prevMonth of prevMonths) {
        //   if (!dtoMonthsSet.has(prevMonth)) {
        //     console.log(`🗑 Intentando eliminar recibo con startDate="${prevMonth}"`);
        //     // Encontrá el recibo EXACTO a eliminar (solo PENDING, opcional)
        //     const receiptToDelete = await receiptRepoTxn.findOne({
        //       where: {
        //         customer: { id: customer.id },
        //         startDate: prevMonth,
        //         status: 'PENDING',
        //       },
        //     });

        //     if (receiptToDelete) {
        //       // Lo removemos con el repositorio transaccional
        //       await receiptRepoTxn.remove(receiptToDelete);
        //       console.log(`✅ Recibo eliminado del mes: ${prevMonth}`);
        //     } else {
        //       console.warn(`⚠️ No se encontró recibo con startDate="${prevMonth}"`);
        //     }
        //   }
        // }

        const formatMonth = (m: string) =>
          dayjs(m.length === 7 ? `${m}-01` : m).format('YYYY-MM-DD');

        const minMonth = newMonthsDebt
          .map(d => dayjs(formatMonth(d.month)))
          .sort((a, b) => a.unix() - b.unix())[0]
          .format('YYYY-MM-DD');

        customer.startDate = minMonth;
        customer.monthsDebt = newMonthsDebt;
        await queryRunner.manager.save(customer);

        for (const monthDebt of newMonthsDebt) {
          const formattedMonth = formatMonth(monthDebt.month);
          const incomingAmount = Number(monthDebt.amount ?? 0);

          const existing = await receiptRepoTxn.findOne({
            where: {
              customer: { id: customer.id },
              startDate: formattedMonth,
            },
          });

          if (existing) {
            if (existing.price !== incomingAmount) {
              existing.price = incomingAmount;
              await receiptRepoTxn.save(existing);
              console.log('Recibo actualizado:', existing);
            }
          } else {
            await this.receiptsService.createReceipt(
              customer.id,
              queryRunner.manager,
              incomingAmount,
              null,
              formattedMonth
            );
          }
        }
      }


      await queryRunner.commitTransaction();
      return savedCustomer;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(error.message, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
  
  async remove(id: string) {
    try {
      const customer = await this.customerRepository.findOne({
        where: { id },
        withDeleted: true,
        relations: [
          'vehicleRenters',
          'vehicleRenters.vehicle',
          'vehicleRenters.vehicle.customer',
          'vehicles',
        ],
      });
  
      if (!customer) {
        throw new NotFoundException(`Customer not found`);
      }
  
      if (customer.customerType === 'RENTER') {
        for (const vehicleRenter of customer.vehicleRenters) {
          if (vehicleRenter.vehicle) {
            vehicleRenter.vehicle.rentActive = false;
            await this.vehicleRepository.save(vehicleRenter.vehicle);
          }
        }
      }
  
      await this.customerRepository.remove(customer);
  
      return { message: 'Customer removed successfully' };
    } catch (error) {
      if (error instanceof QueryFailedError) {
        // Controlar error de Foreign Key
        const message = (error as any).message || '';
        if (message.includes('violates foreign key constraint')) {
          throw new BadRequestException({
            code: 'FOREIGN_KEY_VIOLATION',
            message: 'No se puede eliminar el cliente porque existen relaciones activa/s con inqulino/s.',
          });
        }
      }
  
      if (!(error instanceof NotFoundException) || !(error instanceof BadRequestException)) {
        this.logger.error(error.message, error.stack);
      }
      throw error;
    }
  }
  async softDelete(id: string) {
    try{
      const customer = await this.customerRepository.findOne({
        where: { id },
        relations: ['vehicles', 'receipts', 'vehicleRenters'],
      });

      if(!customer){
        throw new NotFoundException( `Customer ${customer.customerType} not found`)
      }
      if(customer.customerType === 'OWNER'){
        for(const vechile of customer.vehicles){
          await this.vehicleRepository.softDelete(vechile.id);
        }
      }else{
        for(const vechileRenter of customer.vehicleRenters){
          await this.vehicleRenterRepository.softDelete(vechileRenter.id);
        }
      }

      for(const receipt of customer.receipts){
        await this.receiptRepository.softDelete(receipt.id);
      }

      await this.customerRepository.softDelete(customer.id);

      return {message: 'Customer removed successfully'}
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(error.message, error.stack);
      }
      throw error;
    }
  }

  async restoredCustomer(id: string) {
    try{
      const customer = await this.customerRepository.findOne({
        where: { id },
        relations: ['vehicles', 'receipts', 'vehicleRenters'],
        withDeleted: true
      });

      if(!customer){
        throw new NotFoundException( `Customer ${customer.customerType} not found`)
      }

      if(customer.customerType === 'OWNER'){
        for(const vechile of customer.vehicles){
          vechile.deletedAt = null;
          await this.vehicleRepository.save(vechile);
        }
      }else{
        for(const vechileRenter of customer.vehicleRenters){
          vechileRenter.deletedAt = null;
          await this.vehicleRenterRepository.save(vechileRenter);
        }
      }
      for(const receipt of customer.receipts){
        receipt.deletedAt = null;
        await this.receiptRepository.save(receipt);
      }
      customer.deletedAt = null;
      await this.customerRepository.save(customer);

      return {message: 'Customer restored successfully'}
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(error.message, error.stack);
      }
      throw error;
    }
  }

  async createInterest(createInterestSettingDto: CreateInterestSettingDto) {
    try {
      await this.interestSettingsRepository.clear();
      const interest = this.interestSettingsRepository.create(createInterestSettingDto);
      await this.interestSettingsRepository.save(interest);
      return interest;
    } catch (error) {
      this.logger.error(error.message, error.stack);
      throw error;
    }
  }

  async findInterest() {
    try {
      const latestInterest = await this.interestSettingsRepository.find({
        order: { updatedAt: 'DESC' },
        take: 1,
      });
      
      return latestInterest // Retorna el primer elemento si existe
    } catch (error) {
      this.logger.error(`Error al buscar el interés: ${error.message}`);
      throw error;
    }
  }
  


//   @Cron('0 8 1,10,20,28,30 * *', { timeZone: 'America/Argentina/Buenos_Aires' }) // Se ejecutará el 2 de abril a las 17:31
//  // Todos los dias 1,10,30 de cada mes (28 de febrero) a las 8am '0 8 1,10,20,28,30 * *' */1 * * * *
//   async updateInterests() {
//     try {
//       const today = new Date();
//       if (today.getMonth() === 1 && today.getDate() === 30) {
//         this.logger.log('Febrero no tiene día 30, cancelando ejecución.');
//         return;
//       }
  
//       this.logger.log('⏳ Verificando y actualizando intereses de clientes...');
  
//       const customers = await this.customerRepository.find({ relations: ['receipts'] });
  
//       const latestInterest = await this.interestSettingsRepository.find({
//         order: { updatedAt: 'DESC' },
//         take: 1,
//       });
  
//       if (!latestInterest || latestInterest.length === 0) {
//         this.logger.error(`No hay configuración de intereses registrada. Cancelando tarea.`);
//         return;
//       }
  
//       const lastInterest = latestInterest[0];
  
//       for (const customer of customers) {
//         try {
//           const argentinaTime = dayjs().tz('America/Argentina/Buenos_Aires').startOf('day');
//           const hasPaid = customer.startDate ? argentinaTime.isBefore(dayjs(customer.startDate)) : false;
          
//           if (hasPaid) {
//             this.logger.warn(`Cliente ${customer.id} ya pagó este mes. Saltando...`);
//             continue; // Saltar este cliente y seguir con el siguiente
//           }
  
//           const pendingReceipt = customer.receipts?.find((receipt) => receipt.status === 'PENDING');
  
//           if (!pendingReceipt) {
//             this.logger.warn(`Cliente ${customer.id} no tiene recibo pendiente. Saltando...`);
//             continue;
//           }
  

//           const additionalInterest =
//             customer.customerType === 'OWNER' ? lastInterest.interestOwner : lastInterest.interestRenter;
  
//           pendingReceipt.price += additionalInterest;
//           pendingReceipt.interestPercentage += additionalInterest;
//           await this.receiptRepository.save(pendingReceipt);
//           const customerTypeMap = {
//             OWNER: 'Propietario',
//             RENTER: 'Inquilino',
//             PRIVATE: 'Estacionamiento privado',
//           };
          
//           const readableCustomerType = customerTypeMap[customer.customerType] || customer.customerType;

//           const notificationId = uuidv4();
//           this.notificationGateway.sendNotification({
//             id: notificationId,
//             type: 'INTEREST_PROCESSED',
//             title: 'Interes Aplicado',
//             message: `Se aplico un interes al cliente de tipo ${readableCustomerType} ${customer.lastName} ${customer.firstName} de $${additionalInterest}.`,
//             customerType: customer.customerType,
//             customer: customer,
//             lastName: customer.lastName,
//             customerId: customer.id,
//           });
  
//           this.logger.log(`Cliente ${customer.id} actualizado. Nuevo precio: ${pendingReceipt.price}`);
  
//         } catch (error) {
//           this.logger.error(`Error procesando cliente ${customer.id}: ${error.message}`);
//         }
//       }
  
//       this.logger.log('Intereses actualizados correctamente.');
//     } catch (error) {
//       this.logger.error('Error al actualizar intereses', error.stack);
//     }
//   }

async updateAmount(updateAmountAllCustomerDto: UpdateAmountAllCustomerDto) {
  try {

    const manualOwners = [
      'JOSE_RICARDO_AZNAR',
      'CARLOS_ALBERTO_AZNAR',
      'NIDIA_ROSA_MARIA_FONTELA',
      'ALDO_RAUL_FONTELA',
    ];

    const customers = await this.customerRepository.find({
      where: { customerType: 'RENTER' },
      relations: ['vehicles', 'vehicleRenters', 'vehicleRenters.vehicle'],
    });

    if (!customers.length) {
      throw new NotFoundException(
        `No se encontraron clientes de tipo ${updateAmountAllCustomerDto.customerType}`,
      );
    }

    for (const customer of customers) {
        const isManualOwner = manualOwners.includes(updateAmountAllCustomerDto.ownerTypeOfRenter);

        const filteredVehicleRenters = customer.vehicleRenters.filter(vehicleRenter => {
          return isManualOwner
            ? manualOwners.includes(vehicleRenter.owner)
            : !manualOwners.includes(vehicleRenter.owner);
        });

        for (const vehicleRenter of filteredVehicleRenters) {
          if (!isManualOwner && vehicleRenter.vehicle) {
            vehicleRenter.vehicle.amountRenter += updateAmountAllCustomerDto.amount;
            await this.vehicleRepository.save(vehicleRenter.vehicle);
          }
          vehicleRenter.amount += updateAmountAllCustomerDto.amount;
        }

        await this.vehicleRenterRepository.save(filteredVehicleRenters);

      // Actualizar el recibo
      const receipt = await this.receiptRepository.findOne({
        where: { customer: { id: customer.id }, status: 'PENDING' },
      });

      if (receipt) {
        let vehiclesCount = 0;

        const isManualOwner = manualOwners.includes(updateAmountAllCustomerDto.ownerTypeOfRenter);
        vehiclesCount = customer.vehicleRenters.filter(vehicleRenter =>
          isManualOwner
            ? manualOwners.includes(vehicleRenter.owner)
            : !manualOwners.includes(vehicleRenter.owner)
        ).length;

        receipt.price += updateAmountAllCustomerDto.amount * vehiclesCount;
        await this.receiptRepository.save(receipt);
      }
    }

    return { message: 'Monto actualizado correctamente', customers };
  } catch (error) {
    this.logger.error(error.message, error.stack);
    throw error;
  }
}


async createParkingType(createParkingTypeDto: CreateParkingTypeDto) {
  try {
    const existType = await this.parkingTypeRepository.findOne({where:{parkingType:createParkingTypeDto.parkingType}})
    if(existType){
      throw new NotFoundException({
        code: 'PARKING_TYPE_ALREDY_EXIST',
        message: `El tipo de estacionamiento ya existe`,
      });
    }
    const parkingType = this.parkingTypeRepository.create(createParkingTypeDto);
    const savedParkingType = await this.parkingTypeRepository.save(parkingType);

    return savedParkingType;
  } catch (error) {
    this.logger.error(error.message, error.stack);
    throw error;
  }
}

  async findAllParkingType(query: PaginateQuery): Promise<Paginated<ParkingType>> {
    try {
      return await paginate(query, this.parkingTypeRepository, {
        sortableColumns: ['id'],
        nullSort: 'last',
        searchableColumns: ['parkingType'],
        filterableColumns: {
          parkingType: [FilterOperator.ILIKE, FilterOperator.EQ],
        },
        relations: ['vehicles']
      });
    } catch (error) {
      this.logger.error(error.message, error.stack);
    }
  }

  async updateparkingType(parkingTypeId: string, updateParkingTypeDto: UpdateParkingTypeDto) {
    try {
      const parkingType = await this.parkingTypeRepository.findOne({ where: { id: parkingTypeId } });
  
      if (!parkingType) {
        throw new NotFoundException('ParkingType not found');
      }

      const owners = await this.customerRepository.find({
        where: { customerType: 'OWNER' },
        relations: ['vehicles', 'vehicles.parkingType', 'receipts'], // Asegúrate de cargar los vehículos
      });

        for (const owner of owners) {
          const vehiclesToUpdate = owner.vehicles.filter(
            (vehicle) => vehicle.parkingType?.id === parkingType.id
          );

          if (vehiclesToUpdate.length > 0) {
            const count = vehiclesToUpdate.length;
            const amountDifference = (updateParkingTypeDto.amount - parkingType.amount) * count;

            for (const receipt of owner.receipts) {
              if (receipt.status === 'PENDING') {
                receipt.price += amountDifference;
                receipt.startAmount = receipt.price;
                await this.receiptRepository.save(receipt);
              }
            }

            for (const vehicle of vehiclesToUpdate) {
              vehicle.amount = updateParkingTypeDto.amount;
              await this.vehicleRepository.save(vehicle);
            }
          }
        }

  
      const updatedParkingType = this.parkingTypeRepository.merge(parkingType, updateParkingTypeDto);
      const savedParkingType = await this.parkingTypeRepository.save(updatedParkingType);
  
      return savedParkingType;
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(error.message, error.stack);
      }
      throw error;
    }
  }
  
async removeParkingType(parkingTypeId: string) {
  try{
    const parkingType = await this.parkingTypeRepository.findOne({where:{id:parkingTypeId}})

    if(!parkingType){
      throw new NotFoundException('ParkingType not found')
    }

    await this.parkingTypeRepository.remove(parkingType);

    return {message: 'Parking Type list removed successfully'}
  } catch (error) {
    if (!(error instanceof NotFoundException)) {
      this.logger.error(error.message, error.stack);
    }
    throw error;
  }
}
async getCustomerVehicleRenter() {
  try {
    const vehicles = await this.vehicleRepository.find({
      where: {
        rent: true,
      },
      relations: ['customer'],
    });

    return vehicles;
  } catch (error) {
    if (!(error instanceof NotFoundException)) {
      this.logger.error(error.message, error.stack);
    }
    throw error;
  }
}

}

