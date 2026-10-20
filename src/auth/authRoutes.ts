import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { residentProfileRepo, authRepo } from '../database/repositories';
import { generateToken, hashPassword } from './authUtils';
import { authenticateToken } from './authMiddleware';
import { logger } from '../logger';
import { validateBody } from '../routes/validate';
import { registerBody, loginBody } from '../routes/schemas';

const router = Router();

/** The fields of a resident that go into the token and the login response. */
function sessionFor(resident: { id: string; name: string; flatNumber: string; role: string }) {
  const profile = { id: resident.id, name: resident.name, flatNumber: resident.flatNumber, role: resident.role };
  return { resident: profile, token: generateToken(profile) };
}

// The schema has already reduced phone to its canonical form, which is how
// it is stored, so the (flatNumber, phone) unique constraint is the duplicate
// check. This used to load every resident and compare numbers in memory.
router.post('/register', validateBody(registerBody), async (req, res) => {
  const { name, flatNumber, phone, password } = req.body;

  try {
    const created = await authRepo.createResidentWithAuth(
      { name, flatNumber, role: 'resident', phone, email: '' },
      await hashPassword(password),
    );

    res.status(201).json({ message: 'Resident registered successfully', ...sessionFor(created) });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(409).json({ error: 'Resident with this flat number and phone already exists' });
    }
    throw err;
  }
});

router.post('/login', validateBody(loginBody), async (req, res) => {
  const { flatNumber, phone, password } = req.body;

  const resident = await residentProfileRepo.findByFlatAndPhone(flatNumber, phone);
  if (!resident || !(await authRepo.verifyResidentPassword(resident.id, password))) {
    logger.warn('Login failed', { flatNumber });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  await residentProfileRepo.updateLastActive(resident.id);
  res.json({ message: 'Login successful', ...sessionFor(resident) });
});

router.get('/me', authenticateToken, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const resident = await residentProfileRepo.findById(req.user.id);
  if (!resident) {
    return res.status(404).json({ error: 'Resident not found' });
  }

  const { accessToken, ...safeResident } = resident;
  res.json({ user: safeResident });
});

export default router;
