import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateCustomerDto, CreateVehicleDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { InterestCustomer } from './entities/interest-customer.entity';
import { UpdateAmountAllCustomerDto } from './dto/update-amount-all-customers.dto';
import { ParkingType } from './entities/parking-type.entity';
import { CreateParkingTypeDto } from './dto/create-parking-type.dto';
import { UpdateParkingTypeDto } from './dto/update-parking-type.dto';

import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import * as isBetween from 'dayjs/plugin/isBetween'; 

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
      @InjectRepository(ParkingType)
      private readonly parkingTypeRepository: Repository<ParkingType>,
      @InjectRepository(Receipt)
      private readonly receiptRepository: Repository<Receipt>,
      @InjectRepository(InterestSettings)
      private readonly interestSettingsRepository: Repository<InterestSettings>,
      @InjectRepository(InterestCustomer)
      private readonly interestCustomerRepository: Repository<InterestCustomer>,
      private readonly receiptsService: ReceiptsService
    ) {}

    async create(createCustomerDto: CreateCustomerDto) {
      try {

        this.updateDates();
    
        const customer = this.customerRepository.create({
          ...createCustomerDto,
          vehicles: [],
        });
        
        const argentinaTime = dayjs().tz('America/Argentina/Buenos_Aires');
        //const nextMonthStartDate = argentinaTime.add(1, 'month').startOf('month').format('YYYY-MM-DD');
        const nextMonthStartDate = dayjs().tz('America/Argentina/Buenos_Aires').month(3).startOf('month').format('YYYY-MM-DD');

        
        customer.startDate = nextMonthStartDate; // Ahora es un string en formato 'YYYY-MM-DD'
        
        
        const savedCustomer = await this.customerRepository.save(customer);
    
        if (createCustomerDto.vehicles && createCustomerDto.vehicles.length > 0) {
          const vehicles = [];

          for (const vehicleDto of createCustomerDto.vehicles) {
            if(customer.customerType === 'OWNER'){
              const parkingType = await this.parkingTypeRepository.findOne({
                where: { parkingType: vehicleDto.parking },
              });
      
              if (!parkingType) {
                throw new NotFoundException({
                  code: 'PARKING_TYPE_NOT_FOUND',
                  message: 'Parking type not found',
                });
              }
      
              const vehicle = this.vehicleRepository.create({
                ...vehicleDto,
                parkingType, // opcional, depende si esperás la relación o solo el ID
                amount: parkingType.amount,
                customer: savedCustomer,
              });
              vehicles.push(vehicle);
              
            }else{
              const vehicle = this.vehicleRepository.create({
                ...vehicleDto,
                parkingType: null,
                customer: savedCustomer,
              });
              vehicles.push(vehicle);
            }
    
          }
    
          await this.vehicleRepository.save(vehicles);
        }
    
        await this.receiptsService.createReceipt(savedCustomer.id);
    
        return savedCustomer;
      } catch (error) {
        this.logger.error(error.message, error.stack);
        throw error;
      }
    }

  async findAll(customer: CustomerType){
    try {
      const customers = await this.customerRepository.find({
        relations: ['receipts', 'vehicles', 'vehicles.parkingType'],
        where: {customerType : customer}})

        return customers;
    } catch (error) {
      this.logger.error(error.message, error.stack);
    }
  }

  async findOne(id: string) {
    try {
      const customer = await this.customerRepository.findOne({
        where: { id },
        relations: ['receipts', 'interests', 'vehicles','vehicles.parkingType'],
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
    try {
      const customer = await this.customerRepository.findOne({
        where: { id },
        relations: ['vehicles', 'receipts'], // Asegúrate de que las relaciones estén bien cargadas
      });
  
      if (!customer) {
        throw new NotFoundException(`Customer ${id} not found`);
      }
  
      if (customer.vehicles.length > 0) {
        await this.vehicleRepository.remove(customer.vehicles); // Eliminar vehículos previos
        customer.vehicles = []; // Limpiar el array de vehículos
      }
  
      if (updateCustomerDto.vehicles && updateCustomerDto.vehicles.length > 0) {
        const vehicles = [];
  
        for (const vehicleDto of updateCustomerDto.vehicles) {
          if (customer.customerType === 'OWNER') {
            const parkingType = await this.parkingTypeRepository.findOne({
              where: { parkingType: vehicleDto.parking },
            });
  
            if (!parkingType) {
              throw new NotFoundException({
                code: 'PARKING_TYPE_NOT_FOUND',
                message: 'Parking type not found',
              });
            }
            const vehicle = this.vehicleRepository.create({
              ...vehicleDto,
              customer: customer, // Relacionamos el cliente al vehículo
              parkingType: parkingType, // Relacionamos el parkingType con el vehículo
              amount: parkingType.amount,
            });
  
            vehicles.push(vehicle);
          } else {
            const vehicle = this.vehicleRepository.create({
              ...vehicleDto,
              customer: customer, // Relacionamos el cliente al vehículo
              parkingType: null,
            });
            vehicles.push(vehicle);
          }
        }
  
        // Guardar los vehículos después de haber sido creados
        await this.vehicleRepository.save(vehicles);
        
        // Actualizar el cliente después de agregar los vehículos
        customer.vehicles = vehicles; // Asociar los vehículos al cliente
      }
  
      // Actualizar los datos del cliente
      const { vehicles, ...customerData } = updateCustomerDto;
      this.customerRepository.merge(customer, customerData);
  
      const savedCustomer = await this.customerRepository.save(customer);
  
      // Calcular el monto total de los vehículos
      const totalVehicleAmount = customer.vehicles.reduce(
        (acc, vehicle) => acc + (vehicle.amount || 0),
        0
      );
  
      // Actualizar el recibo del cliente
      const receipt = await this.receiptRepository.findOne({
        where: { customer: { id: customer.id }, status: 'PENDING' },
      });
  
      if (receipt) {
        receipt.price = totalVehicleAmount;
        await this.receiptRepository.save(receipt);
      }
  
      return savedCustomer;
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(error.message, error.stack);
      }
      throw error;
    }
  }
  

  async remove(id: string) {
    try{
      const customer = await this.customerRepository.findOne({where:{id:id}})

      if(!customer){
        throw new NotFoundException( `Customer ${customer.customerType} not found`)
      }

      await this.customerRepository.remove(customer);

      return {message: 'Customer removed successfully'}
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

  async createInterestForCustomer(customer: Customer): Promise<InterestCustomer> {
    try {
      const latestInterest = await this.interestSettingsRepository.find({
        order: { updatedAt: 'DESC' },
        take: 1,
      });

  
      if (latestInterest.length === 0) {
        throw new NotFoundException(`No interest settings found`);
      }
  
      const lastInterest = latestInterest[0];
  
      const newInterest = this.interestCustomerRepository.create({
        customer: customer,
      });
  
      await this.interestCustomerRepository.save(newInterest);
  
      return newInterest;
    } catch (error) {
      this.logger.error(`Error al crear interés para el cliente ${customer.id}: ${error.message}`);
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
  


  @Cron('59 17 2 4 *', { timeZone: 'America/Argentina/Buenos_Aires' }) // Se ejecutará el 2 de abril a las 17:31
 // Todos los dias 1,10,30 de cada mes (28 de febrero) a las 8am '0 8 1,10,20,28,30 * *' */1 * * * *
  async updateInterests() {
    try {
      const today = new Date();
      if (today.getMonth() === 1 && today.getDate() === 30) {
        this.logger.log('Febrero no tiene día 30, cancelando ejecución.');
        return;
      }
  
      this.logger.log('⏳ Verificando y actualizando intereses de clientes...');
  
      const customers = await this.customerRepository.find({ relations: ['interests', 'receipts'] });
  
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

async updateDates(){
  const customers = await this.customerRepository.find({ relations: ['interests', 'receipts'] });

  for(const customer of customers){
    const nextMonthStartDate = dayjs().tz('America/Argentina/Buenos_Aires').month(3).startOf('month').format('YYYY-MM-DD');
    customer.startDate = nextMonthStartDate;

    const pendingReceipt = customer.receipts?.find((receipt) => receipt.status === 'PENDING');
    pendingReceipt.startDate= nextMonthStartDate;
    await this.customerRepository.save(customer);
    await this.receiptRepository.save(pendingReceipt);
  }

}

}

