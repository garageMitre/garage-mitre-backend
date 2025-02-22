import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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

@Injectable()
export class CustomersService {
    private readonly logger = new Logger(CustomersService.name);
    
    constructor(
      @InjectRepository(Customer)
      private readonly customerRepository: Repository<Customer>,
      @InjectRepository(Vehicle)
      private readonly vehicleRepository: Repository<Vehicle>,
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

        const customer = this.customerRepository.create({
          ...createCustomerDto,
          vehicles: [],
        });
    
        const now = new Date();
        const nextMonthStartDate = startOfMonth(addMonths(now, 1));
        customer.startDate = nextMonthStartDate;
    
        const savedCustomer = await this.customerRepository.save(customer);
    
        if (createCustomerDto.vehicles && createCustomerDto.vehicles.length > 0) {
          const vehicles = createCustomerDto.vehicles.map((vehicle) =>
            this.vehicleRepository.create({ ...vehicle, customer: savedCustomer })
          );
          await this.vehicleRepository.save(vehicles);
        }
    
        await this.receiptsService.createReceipt(savedCustomer.id);
    
        return savedCustomer;
      } catch (error) {
        this.logger.error(error.message, error.stack);
        throw error;
      }
    }
    
  async findAll(query: PaginateQuery, customer: CustomerType): Promise<Paginated<Customer>> {
    try {
      return await paginate(query, this.customerRepository, {
        sortableColumns: ['id', 'firstName', 'email'],
        nullSort: 'last',
        defaultSortBy: [['createdAt', 'DESC']],
        searchableColumns: ['firstName', 'email'],
        filterableColumns: {
          firstName: [FilterOperator.ILIKE, FilterOperator.EQ],
          email: [FilterOperator.EQ, FilterOperator.ILIKE],
        },
        relations: ['receipts', 'vehicles'],
        where: {customerType : customer}
      });
    } catch (error) {
      this.logger.error(error.message, error.stack);
    }
  }

  async findOne(id: string) {
    try {
      const customer = await this.customerRepository.findOne({
        where: { id },
        relations: ['receipts', 'interests'],
      });
  
      if (!customer) {
        throw new NotFoundException(`Customer not found`);
      }
  
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
        relations: ['vehicles', 'receipts'],
      });
  
      if (!customer) {
        throw new NotFoundException(`Customer ${id} not found`);
      }
  
      if (customer.vehicles.length > 0) {
        await this.vehicleRepository.remove(customer.vehicles);
        customer.vehicles = [];
      }
  
      const newVehicles = updateCustomerDto.vehicles.map((vehicleDto) =>
        this.vehicleRepository.create({
          ...vehicleDto,
          customer,
        }),
      );
  
      const savedVehicles = await this.vehicleRepository.save(newVehicles);
  
      customer.vehicles = savedVehicles;

      const { vehicles, ...customerData } = updateCustomerDto;
      this.customerRepository.merge(customer, customerData);
  
      const savedCustomer = await this.customerRepository.save(customer);

      const totalVehicleAmount = customer.vehicles.reduce((acc, vehicle) => acc + (vehicle.amount || 0), 0);

      const receipt = await this.receiptRepository.findOne({
        where: { customer:{id:customer.id}, status:'PENDING'},
    });

      receipt.price = totalVehicleAmount;

      await this.receiptRepository.save(receipt)
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
  
      const appliedInterest =
        customer.customerType === 'OWNER'
          ? lastInterest.interestOwner
          : lastInterest.interestRenter;
  
      const newInterest = this.interestCustomerRepository.create({
        interest: appliedInterest,
        customer: customer,
      });
  
      await this.interestCustomerRepository.save(newInterest);
  
      return newInterest;
    } catch (error) {
      this.logger.error(`Error al crear interés para el cliente ${customer.id}: ${error.message}`);
      throw error;
    }
  }
  


  @Cron('0 8 1,10,20,28,30 * *') // Todos los dias 1,10,30 de cada mes (28 de febrero) a las 8am
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
        const createdAt = new Date(customer.startDate);
        const now = new Date();
        const diffInDays = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  
        if (diffInDays < 10) {
          this.logger.log(`Cliente ${customer.id} aún no ha alcanzado los 10 días (${diffInDays} días).`);
          continue;
        }
  
        const pendingReceipt = customer.receipts?.find((receipt) => receipt.status === 'PENDING');
  
        let latestCustomerInterest = customer.interests?.sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        )[0];
  
        const additionalInterest =
          customer.customerType === 'OWNER' ? lastInterest.interestOwner : lastInterest.interestRenter;
  
        if (!latestCustomerInterest) {
          this.logger.log(`Cliente ${customer.id} no tiene un interés aplicado. Creando uno nuevo...`);
          latestCustomerInterest = await this.createInterestForCustomer(customer);
        } else {
          this.logger.log(`Cliente ${customer.id} ya tiene un interés aplicado. Sumando más interés...`);
          latestCustomerInterest.interest += additionalInterest;
          latestCustomerInterest.updatedAt = new Date();
          await this.interestCustomerRepository.save(latestCustomerInterest);
        }
        pendingReceipt.price += additionalInterest;
        pendingReceipt.interestPercentage = latestCustomerInterest.interest;
        await this.receiptRepository.save(pendingReceipt);
  
        this.logger.log(`Cliente ${customer.id} actualizado. Nuevo precio: ${pendingReceipt.price}`);
      }
  
      this.logger.log('Intereses actualizados correctamente.');
    } catch (error) {
      this.logger.error('Error al actualizar intereses', error.stack);
    }
  }
   
}

