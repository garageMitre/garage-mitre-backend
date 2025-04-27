import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateCustomerDto, CreateVehicleDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
    
        const argentinaTime = dayjs().tz('America/Argentina/Buenos_Aires');
        const nextMonthStartDate = argentinaTime.month(3).startOf('month').format('YYYY-MM-DD');
        customer.startDate = nextMonthStartDate;
    
        const savedCustomer = await customerRepo.save(customer);
    
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
    
              const existingGarageNumberOwner = await vehicleRepo.findOne({ where: { garageNumber: vehicleDto.garageNumber } });
              const existingGarageNumberRenter = await vehicleRenterRepo.findOne({ where: { garageNumber: vehicleDto.garageNumber } });
    
              if (existingGarageNumberOwner || existingGarageNumberRenter) {
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
              if (vehicleRenterDto.owner !== 'GARAGE_MITRE') {
                const vehicleOwner = await vehicleRepo.findOne({
                  where: { id: vehicleRenterDto.owner },
                  relations: ['customer'],
                });
    
                if (!vehicleOwner) {
                  throw new NotFoundException('Vehicle not found');
                }
    
                const existingGarageNumberOwner = await vehicleRepo.findOne({ where: { garageNumber: vehicleRenterDto.garageNumber } });
                const existingGarageNumberRenter = await vehicleRenterRepo.findOne({ where: { garageNumber: vehicleRenterDto.garageNumber } });
    
                if (existingGarageNumberOwner || existingGarageNumberRenter) {
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
                const existingGarageNumberOwner = await vehicleRepo.findOne({ where: { garageNumber: vehicleRenterDto.garageNumber } });
                const existingGarageNumberRenter = await vehicleRenterRepo.findOne({ where: { garageNumber: vehicleRenterDto.garageNumber } });
    
                if (existingGarageNumberOwner || existingGarageNumberRenter) {
                  throw new NotFoundException({
                    code: 'GARAGE_NUMBER_ALREADY_EXIST',
                    message: `El número de garage ${vehicleRenterDto.garageNumber} ya se encuentra en uso`,
                  });
                }
    
                const vehicle = vehicleRenterRepo.create({
                  ...vehicleRenterDto,
                  owner: 'GARAGE_MITRE',
                  customer: savedCustomer,
                });
    
                vehiclesRenter.push(vehicle);
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
    
        // 👇 Y pasamos el total correctamente
        await this.receiptsService.createReceipt(savedCustomer.id, queryRunner.manager, totalVehicleAmount);
    
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
        relations: ['receipts', 'vehicles', 'vehicles.parkingType', 'vehicleRenters','vehicleRenters.vehicle','vehicleRenters.vehicle.customer'],
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
        relations: ['receipts','vehicles','vehicles.parkingType', 'vehicles.vehicleRenters'],
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
  
      // Desactivar rentActive de vehículos rentados
      if (customer.vehicleRenters.length > 0) {
        for (const vehicleRenter of customer.vehicleRenters) {
          if (vehicleRenter.owner !== 'GARAGE_MITRE') {
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
            const existingGarageNumberOwner = await vehicleRepo.findOne({ where: { garageNumber: vehicleDto.garageNumber } });
            const existingGarageNumberRenter = await vehicleRenterRepo.findOne({ where: { garageNumber: vehicleDto.garageNumber } });

            if (
              oldVehicle.garageNumber !== vehicleDto.garageNumber &&
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
            if (vehicleRenterDto.owner !== 'GARAGE_MITRE') {
              const vehicleOwner = await vehicleRepo.findOne({
                where: { id: vehicleRenterDto.owner },
                relations: ['customer'],
              });
  
              if (!vehicleOwner) throw new NotFoundException('vehicle not found');

              const existingGarageNumberOwner = await vehicleRepo.findOne({ where: { garageNumber: vehicleRenterDto.garageNumber } });
              const existingGarageNumberRenter = await vehicleRenterRepo.findOne({ where: { garageNumber: vehicleRenterDto.garageNumber } });
  
              if (existingGarageNumberOwner || existingGarageNumberRenter) {
                throw new NotFoundException({
                  code: 'GARAGE_NUMBER_ALREADY_EXIST',
                  message: `El número de garage ${vehicleRenterDto.garageNumber} ya se encuentra en uso`,
                });
              }
              
  
              const vehicle = vehicleRenterRepo.create({
                customer: customer,
                vehicle: vehicleOwner,
                amount: vehicleOwner.amountRenter || 0,
                garageNumber: vehicleOwner.garageNumber,
                owner: vehicleRenterDto.owner,
              });
  
              vehicleOwner.rentActive = true;
              await queryRunner.manager.save(vehicleOwner);
  
              vehiclesRenter.push(vehicle);
            } else {
              
              const existingGarageNumberOwner = await vehicleRepo.findOne({ where: { garageNumber: vehicleRenterDto.garageNumber } });
              const existingGarageNumberRenter = await vehicleRenterRepo.findOne({ where: { garageNumber: vehicleRenterDto.garageNumber } });

              if (
                customer.vehicleRenters[0].garageNumber !== vehicleRenterDto.garageNumber &&
                (existingGarageNumberOwner || existingGarageNumberRenter)
              ) {
                throw new NotFoundException({
                  code: 'GARAGE_NUMBER_ALREADY_EXIST',
                  message: `El número de garage ${vehicleRenterDto.garageNumber} ya se encuentra en uso`,
                });
              }
              customer.vehicleRenters = [];
              
              
              const vehicle = vehicleRenterRepo.create({
                ...vehicleRenterDto,
                owner: 'GARAGE_MITRE',
                customer: customer,
              });
              customer.vehicleRenters.push(vehicle)
  
              vehiclesRenter.push(vehicle);
            }
          }
  
          await queryRunner.manager.save(vehiclesRenter);
        }
      }
  
      // Actualizar Customer
      const { vehicles, vehicleRenters, ...customerData } = updateCustomerDto;
      customerRepo.merge(customer, customerData);
      const savedCustomer = await queryRunner.manager.save(customer);
  
      // Actualizar recibo si está pendiente
      const totalVehicleAmount = customer.vehicles?.length
        ? customer.vehicles.reduce((acc, vehicle) => acc + (vehicle.amount || 0), 0)
        : customer.vehicleRenters.reduce((acc, vehicle) => acc + (vehicle.amount || 0), 0);
  
      const price = totalVehicleAmount;
  
      const receipt = await receiptRepo.findOne({
        where: { customer: { id: customer.id }, status: 'PENDING' },
      });
  
      if (receipt) {
        receipt.price = price;
        await queryRunner.manager.save(receipt);
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
    try{
      const customer = await this.customerRepository.findOne({where:{id:id}, withDeleted: true, relations:['vehicleRenters','vehicleRenters.vehicle','vehicleRenters.vehicle.customer']})

      if(!customer){
        throw new NotFoundException( `Customer ${customer.customerType} not found`)
      }
      if(customer.customerType === 'RENTER' && customer.vehicleRenters[0].vehicle !== null){
        for(const vehicle of customer.vehicleRenters){
          vehicle.vehicle.rentActive = false;
          await this.vehicleRepository.save(vehicle.vehicle)
        }
      }
      const vehicle_renters = await this.vehicleRenterRepository.findOne({where:{id:customer.vehicleRenters[0].id}})
      await this.vehicleRenterRepository.remove(vehicle_renters)
      await this.customerRepository.remove(customer);

      return {message: 'Customer removed successfully'}
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(error.message, error.stack);
      }
      throw error;
    }
  }

  async softDelete(id: string) {
    try{
      const customer = await this.customerRepository.findOne({
        where: { id },
        relations: ['vehicles', 'receipts'],
      });

      if(!customer){
        throw new NotFoundException( `Customer ${customer.customerType} not found`)
      }
      for(const vechile of customer.vehicles){
        await this.vehicleRepository.softDelete(vechile.id);
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
        relations: ['vehicles', 'receipts'],
        withDeleted: true
      });

      if(!customer){
        throw new NotFoundException( `Customer ${customer.customerType} not found`)
      }
      for(const vechile of customer.vehicles){
        vechile.deletedAt = null;
        await this.vehicleRepository.save(vechile);
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
  


  @Cron('0 8 1,10,20,28,30 * *', { timeZone: 'America/Argentina/Buenos_Aires' }) // Se ejecutará el 2 de abril a las 17:31
 // Todos los dias 1,10,30 de cada mes (28 de febrero) a las 8am '0 8 1,10,20,28,30 * *' */1 * * * *
  async updateInterests() {
    try {
      const today = new Date();
      if (today.getMonth() === 1 && today.getDate() === 30) {
        this.logger.log('Febrero no tiene día 30, cancelando ejecución.');
        return;
      }
  
      this.logger.log('⏳ Verificando y actualizando intereses de clientes...');
  
      const customers = await this.customerRepository.find({ relations: ['receipts'] });
  
      const latestInterest = await this.interestSettingsRepository.find({
        order: { updatedAt: 'DESC' },
        take: 1,
      });
  
      if (!latestInterest || latestInterest.length === 0) {
        this.logger.error(`No hay configuración de intereses registrada. Cancelando tarea.`);
        return;
      }
  
      const lastInterest = latestInterest[0];
  
      for (const customer of customers) {
        try {
          const argentinaTime = dayjs().tz('America/Argentina/Buenos_Aires').startOf('day');
          const hasPaid = customer.startDate ? argentinaTime.isBefore(dayjs(customer.startDate)) : false;
          
          if (hasPaid) {
            this.logger.warn(`Cliente ${customer.id} ya pagó este mes. Saltando...`);
            continue; // Saltar este cliente y seguir con el siguiente
          }
  
          const pendingReceipt = customer.receipts?.find((receipt) => receipt.status === 'PENDING');
  
          if (!pendingReceipt) {
            this.logger.warn(`Cliente ${customer.id} no tiene recibo pendiente. Saltando...`);
            continue;
          }
  

          const additionalInterest =
            customer.customerType === 'OWNER' ? lastInterest.interestOwner : lastInterest.interestRenter;
  
          pendingReceipt.price += additionalInterest;
          pendingReceipt.interestPercentage += additionalInterest;
          await this.receiptRepository.save(pendingReceipt);
          const customerTypeMap = {
            OWNER: 'Propietario',
            RENTER: 'Inquilino',
            PRIVATE: 'Estacionamiento privado',
          };
          
          const readableCustomerType = customerTypeMap[customer.customerType] || customer.customerType;

          const notificationId = uuidv4();
          this.notificationGateway.sendNotification({
            id: notificationId,
            type: 'INTEREST_PROCESSED',
            title: 'Interes Aplicado',
            message: `Se aplico un interes al cliente de tipo ${readableCustomerType} ${customer.lastName} ${customer.firstName} de $${additionalInterest}.`,
            customerType: customer.customerType,
            customer: customer,
            lastName: customer.lastName,
            customerId: customer.id,
          });
  
          this.logger.log(`Cliente ${customer.id} actualizado. Nuevo precio: ${pendingReceipt.price}`);
  
        } catch (error) {
          this.logger.error(`Error procesando cliente ${customer.id}: ${error.message}`);
        }
      }
  
      this.logger.log('Intereses actualizados correctamente.');
    } catch (error) {
      this.logger.error('Error al actualizar intereses', error.stack);
    }
  }

  async updateAmount(updateAmountAllCustomerDto: UpdateAmountAllCustomerDto) {
    try {
        // Obtener todos los clientes del tipo especificado con sus vehículos
        const customers = await this.customerRepository.find({
            where: { customerType: updateAmountAllCustomerDto.customerType },
            relations: ['vehicles']
        });

        if (!customers.length) {
            throw new NotFoundException(`No se encontraron clientes de tipo ${updateAmountAllCustomerDto.customerType}`);
        }

        // Iterar sobre cada cliente y actualizar el monto de sus vehículos
        for (const customer of customers) {
            for (const vehicle of customer.vehicles) {
                vehicle.amount += updateAmountAllCustomerDto.amount;
            }
            // Guardar los cambios en los vehículos de este cliente
            await this.vehicleRepository.save(customer.vehicles);
            const receipt = await this.receiptRepository.findOne({
              where: { customer:{id:customer.id}, status:'PENDING'},
          });
      
            receipt.price += updateAmountAllCustomerDto.amount * customer.numberOfVehicles;
      
            await this.receiptRepository.save(receipt)
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
      await this.parkingTypeRepository.remove(existType)
      const parkingType = this.parkingTypeRepository.create(createParkingTypeDto);
      const savedParkingType = await this.parkingTypeRepository.save(parkingType);
  
      return savedParkingType;
    }
    const parkingType = this.parkingTypeRepository.create(createParkingTypeDto);
    const savedParkingType = await this.parkingTypeRepository.save(parkingType);

    return savedParkingType;
  } catch (error) {
    this.logger.error(error.message, error.stack);
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
  try{
    const parkingType = await this.parkingTypeRepository.findOne({where:{id:parkingTypeId}})

    if(!parkingType){
      throw new NotFoundException('ParkingType not found')
    }
    const owners = await this.customerRepository.find({where:{customerType:'OWNER'}});
    const differenceAmount = updateParkingTypeDto > parkingType ? updateParkingTypeDto.amount - parkingType.amount : parkingType.amount - updateParkingTypeDto.amount;

    for(const owner of owners){
      const receipt = await this.receiptRepository.findOne({
        where: { customer: { id: owner.id }, status: 'PENDING' },
      });
  
      receipt.price = updateParkingTypeDto > parkingType ? receipt.price + differenceAmount : receipt.price - differenceAmount;

      await this.receiptRepository.save(receipt);
    }
    
    const updateParkingType = this.parkingTypeRepository.merge(parkingType, updateParkingTypeDto);

    const savedParkingType = await this.parkingTypeRepository.save(updateParkingType); 

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

