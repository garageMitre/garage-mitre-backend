import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity({ name: 'verification_token' })
@Unique(['email', 'token'])
export class VerificationToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 255 })
  email: string;

  @Column('varchar', { length: 255 })
  token: string;

  @Column('timestamp')
  expiresAt: Date;
}
