import { hashPassword, verifyPassword } from '../../auth/authUtils';
import { PrismaClient } from '@prisma/client';

export class AuthRepository {
  constructor(private prisma: PrismaClient) {}

  async createResidentWithAuth(residentData: any, passwordHash: string): Promise<any> {
    const now = new Date().toISOString();
    const residentId = `RES-${Date.now()}`;
    const accessToken = `TOK-${Date.now().toString().slice(-6)}`;

    const resident = await this.prisma.residentProfile.create({
      data: {
        id: residentId,
        name: residentData.name,
        flatNumber: residentData.flatNumber,
        role: residentData.role,
        phone: residentData.phone,
        email: residentData.email || '',
        status: 'active',
        accessToken,
        tokensGenerated: 0,
        lastActiveAt: now,
        createdAt: now,
        passwordHashes: {
          create: {
            hash: passwordHash,
          },
        },
      },
    });

    return resident;
  }

  async verifyResidentPassword(residentId: string, password: string): Promise<boolean> {
    // updatePassword appends a row rather than replacing one, so a resident can
    // have several hashes. Without this ordering findFirst returned an arbitrary
    // row, which let a password that had already been changed keep working.
    const record = await this.prisma.residentPassword.findFirst({
      where: { residentId },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) return false;
    return verifyPassword(password, record.hash);
  }

  async updatePassword(residentId: string, newPasswordHash: string): Promise<void> {
    await this.prisma.residentPassword.create({
      data: {
        residentId,
        hash: newPasswordHash,
      },
    });
  }
}
