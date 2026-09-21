import { Router } from 'express';
import { residentProfileRepo, authRepo } from '../database/repositories';
import { generateToken, hashPassword } from './authUtils';
import { authenticateToken } from './authMiddleware';

const router = Router();

function normalizePhone(phone?: string) {
  if (!phone) return '';
  return phone.toString().replace(/[^0-9]/g, '');
}

router.post('/register', async (req, res) => {
  try {
    const { name, flatNumber, phone, password } = req.body;

    if (!name || !flatNumber || !phone || !password) {
      return res.status(400).json({
        error: 'Name, flat number, phone, and password are required'
      });
    }

    const allResidents = await residentProfileRepo.findAll();
    const existingResident = allResidents.find(
      r => r.flatNumber === flatNumber && normalizePhone(r.phone) === normalizePhone(phone)
    );

    if (existingResident) {
      return res.status(409).json({
        error: 'Resident with this flat number and phone already exists'
      });
    }

    const hashedPassword = await authRepo.createResidentWithAuth({
      name,
      flatNumber,
      role: 'resident',
      phone,
      email: '',
    }, await import('./authUtils').then(m => m.hashPassword(password)));

    const token = generateToken({
      id: hashedPassword.id,
      name: hashedPassword.name,
      flatNumber: hashedPassword.flatNumber,
      role: hashedPassword.role,
    });

    res.status(201).json({
      message: 'Resident registered successfully',
      resident: {
        id: hashedPassword.id,
        name: hashedPassword.name,
        flatNumber: hashedPassword.flatNumber,
        role: hashedPassword.role,
      },
      token,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { flatNumber, phone, password } = req.body;

    if (!flatNumber || !phone || !password) {
      return res.status(400).json({
        error: 'Flat number, phone, and password are required'
      });
    }

    const incomingDigits = normalizePhone(phone);
    const incomingLast10 = incomingDigits.slice(-10);

    const allResidents = await residentProfileRepo.findAll();
    const resident = allResidents.find((r) => {
      const flatMatches = r.flatNumber?.toString().trim().toLowerCase() === flatNumber.toString().trim().toLowerCase();
      if (!flatMatches) return false;
      const storedDigits = normalizePhone(r.phone);
      const storedLast10 = storedDigits.slice(-10);
      return storedDigits === incomingDigits || storedLast10 === incomingLast10;
    });

    if (!resident) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await authRepo.verifyResidentPassword(resident.id, password);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken({
      id: resident.id,
      name: resident.name,
      flatNumber: resident.flatNumber,
      role: resident.role,
    });

    await residentProfileRepo.updateLastActive(resident.id);

    res.json({
      message: 'Login successful',
      resident: {
        id: resident.id,
        name: resident.name,
        flatNumber: resident.flatNumber,
        role: resident.role,
      },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const resident = await residentProfileRepo.findById(req.user.id);
  if (!resident) {
    return res.status(404).json({ error: 'Resident not found' });
  }

  const { accessToken, ...safeResident } = resident as any;
  res.json({
    user: safeResident,
  });
});

export default router;
