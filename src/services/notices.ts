import { prisma, unscopedPrisma } from '../database/prisma';
import { requireSocietyId } from '../requestContext';
import { isStaff, type Actor } from '../auth/actor';
import { sendNotification } from './notifications';

/**
 * Notices from the society office to residents: to everyone, to chosen
 * towers, or to chosen flats. Scheduled ones go out when their time comes;
 * the office can see who has read an urgent one and remind the rest.
 */

export type Audience = 'all' | 'towers' | 'flats';

export interface NoticeInput {
  title: string;
  body: string;
  audience: Audience;
  towerIds: string[];
  flatIds: string[];
  urgent: boolean;
  pinned: boolean;
  publishAt?: Date | null;
  expiresAt?: Date | null;
  pollOptions: string[];
}

export class NoticeError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'NoticeError';
  }
}

interface AudienceFields {
  audience: string;
  towerIds: string[];
  flatIds: string[];
}

/** The flats a person lives in here, and the towers those flats are in. */
async function homeOf(actor: Actor) {
  const flats = await prisma.flat.findMany({
    where: { id: { in: actor.flats.map((f) => f.id) } },
    select: { id: true, towerId: true },
  });
  return { flatIds: flats.map((f) => f.id), towerIds: flats.flatMap((f) => (f.towerId ? [f.towerId] : [])) };
}

function isFor(notice: AudienceFields, home: { flatIds: string[]; towerIds: string[] }) {
  if (notice.audience === 'towers') return notice.towerIds.some((id) => home.towerIds.includes(id));
  if (notice.audience === 'flats') return notice.flatIds.some((id) => home.flatIds.includes(id));
  return true;
}

/** Shown now: published, not expired, not removed. */
const live = (now = new Date()) => ({
  deletedAt: null,
  publishAt: { lte: now },
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
});

/** Everyone a notice is for: the people living in the flats it reaches. */
async function audienceOf(notice: AudienceFields) {
  const occupants = await prisma.flatOccupant.findMany({
    where: {
      status: 'active',
      flat: {
        deletedAt: null,
        ...(notice.audience === 'towers' ? { towerId: { in: notice.towerIds } } : {}),
        ...(notice.audience === 'flats' ? { id: { in: notice.flatIds } } : {}),
      },
    },
    include: {
      user: { select: { id: true, name: true, phoneNumber: true } },
      flat: { select: { number: true } },
    },
  });
  // One person in two flats is one reader.
  const people = new Map<string, { id: string; name: string; phone: string | null; flats: string[] }>();
  for (const o of occupants) {
    const p = people.get(o.userId) ?? { id: o.user.id, name: o.user.name, phone: o.user.phoneNumber, flats: [] };
    p.flats.push(o.flat.number);
    people.set(o.userId, p);
  }
  return [...people.values()];
}

async function checkAudience(input: Pick<NoticeInput, 'audience' | 'towerIds' | 'flatIds'>) {
  if (input.audience === 'towers') {
    if (!input.towerIds.length) throw new NoticeError(400, 'Choose at least one tower');
    const found = await prisma.tower.count({ where: { id: { in: input.towerIds }, deletedAt: null } });
    if (found !== new Set(input.towerIds).size) throw new NoticeError(400, 'A chosen tower is not in this society');
  }
  if (input.audience === 'flats') {
    if (!input.flatIds.length) throw new NoticeError(400, 'Choose at least one flat');
    const found = await prisma.flat.count({ where: { id: { in: input.flatIds }, deletedAt: null } });
    if (found !== new Set(input.flatIds).size) throw new NoticeError(400, 'A chosen flat is not in this society');
  }
}

/** Tells a notice's audience it is out. */
async function announce(
  notice: { id: string; title: string; urgent: boolean } & AudienceFields,
  people?: { id: string; name: string; phone: string | null }[],
) {
  const society = await unscopedPrisma.society.findUnique({
    where: { id: requireSocietyId() },
    select: { name: true },
  });
  for (const p of people ?? (await audienceOf(notice))) {
    if (!p.phone) continue;
    await sendNotification({
      ticketId: null,
      recipientType: 'resident',
      recipientName: p.name,
      phone: p.phone,
      recipientUserId: p.id,
      message: `${notice.urgent ? 'URGENT notice' : 'Notice'} from ${society?.name ?? 'your society'}: ${notice.title}. Open SocietyOps to read it.`,
    });
  }
}

/** Sends out notices whose time has come. Safe to run repeatedly; each goes out once. */
export async function publishDueNotices(now = new Date()) {
  const due = await prisma.notice.findMany({ where: { ...live(now), notifiedAt: null } });
  for (const notice of due) {
    // Claimed first, so two runs at once cannot both send it.
    const claimed = await prisma.notice.updateMany({
      where: { id: notice.id, notifiedAt: null },
      data: { notifiedAt: now },
    });
    if (claimed.count) await announce(notice);
  }
  return due.length;
}

export async function createNotice(input: NoticeInput, createdById: string) {
  await checkAudience(input);
  if (input.expiresAt && input.expiresAt <= (input.publishAt ?? new Date())) {
    throw new NoticeError(400, 'The notice must expire after it is published');
  }
  const notice = await prisma.notice.create({
    data: {
      ...input,
      towerIds: input.audience === 'towers' ? input.towerIds : [],
      flatIds: input.audience === 'flats' ? input.flatIds : [],
      publishAt: input.publishAt ?? new Date(),
      expiresAt: input.expiresAt ?? null,
      societyId: requireSocietyId(),
      createdById,
    },
  });
  await publishDueNotices();
  return notice;
}

/** A poll's choices are fixed once posted, so votes keep their meaning. */
export type NoticeUpdate = Partial<Omit<NoticeInput, 'publishAt' | 'pollOptions'>> & { publishAt?: Date };

export async function updateNotice(id: string, input: NoticeUpdate) {
  const existing = await prisma.notice.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NoticeError(404, 'Notice not found');
  const merged = { ...existing, ...input };
  await checkAudience(merged as NoticeInput);
  if (merged.expiresAt && merged.expiresAt <= merged.publishAt) {
    throw new NoticeError(400, 'The notice must expire after it is published');
  }
  const notice = await prisma.notice.update({ where: { id }, data: input });
  await publishDueNotices();
  return notice;
}

export async function removeNotice(id: string) {
  const result = await prisma.notice.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } });
  if (!result.count) throw new NoticeError(404, 'Notice not found');
}

/** Poll results: how many chose each option. */
async function tally(noticeId: string, options: number) {
  const votes = await unscopedPrisma.noticeVote.groupBy({
    by: ['option'],
    where: { noticeId },
    _count: { _all: true },
  });
  return Array.from({ length: options }, (_, i) => votes.find((v) => v.option === i)?._count._all ?? 0);
}

/** The notices this person can see now, pinned and urgent first, with what they have read. */
export async function noticesFor(actor: Actor) {
  const home = await homeOf(actor);
  const staff = isStaff(actor);
  const rows = (await prisma.notice.findMany({ where: live(), orderBy: { publishAt: 'desc' } })).filter(
    (n) => staff || isFor(n, home),
  );

  const ids = rows.map((n) => n.id);
  const [reads, votes] = await Promise.all([
    unscopedPrisma.noticeRead.findMany({ where: { noticeId: { in: ids }, userId: actor.id } }),
    unscopedPrisma.noticeVote.findMany({ where: { noticeId: { in: ids }, userId: actor.id } }),
  ]);

  const notices = await Promise.all(
    rows.map(async (n) => {
      const myVote = votes.find((v) => v.noticeId === n.id)?.option ?? null;
      return {
        id: n.id,
        title: n.title,
        body: n.body,
        urgent: n.urgent,
        pinned: n.pinned,
        publishAt: n.publishAt,
        expiresAt: n.expiresAt,
        read: reads.some((r) => r.noticeId === n.id),
        pollOptions: n.pollOptions,
        myVote,
        // Results once you have voted, so they do not sway the vote.
        results: n.pollOptions.length && (myVote !== null || staff) ? await tally(n.id, n.pollOptions.length) : null,
      };
    }),
  );
  notices.sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      Number(b.urgent && !b.read) - Number(a.urgent && !a.read) ||
      b.publishAt.getTime() - a.publishAt.getTime(),
  );
  return { unread: notices.filter((n) => !n.read).length, notices };
}

/** A notice this person may see now, or a 404 that reveals nothing. */
async function visibleNotice(actor: Actor, id: string) {
  const notice = await prisma.notice.findFirst({ where: { id, ...live() } });
  if (!notice || (!isStaff(actor) && !isFor(notice, await homeOf(actor)))) {
    throw new NoticeError(404, 'Notice not found');
  }
  return notice;
}

export async function markRead(actor: Actor, id: string) {
  await visibleNotice(actor, id);
  await unscopedPrisma.noticeRead.upsert({
    where: { noticeId_userId: { noticeId: id, userId: actor.id } },
    create: { noticeId: id, userId: actor.id },
    update: {},
  });
}

export async function vote(actor: Actor, id: string, option: number) {
  const notice = await visibleNotice(actor, id);
  if (!notice.pollOptions.length) throw new NoticeError(400, 'This notice has no poll');
  if (option < 0 || option >= notice.pollOptions.length) throw new NoticeError(400, 'That is not one of the choices');
  await unscopedPrisma.noticeVote.upsert({
    where: { noticeId_userId: { noticeId: id, userId: actor.id } },
    create: { noticeId: id, userId: actor.id, option },
    update: { option },
  });
  // Voting counts as reading it.
  await markRead(actor, id);
  return tally(id, notice.pollOptions.length);
}

/** For the office: every notice, scheduled and expired too, with how many have read it. */
export async function allNotices() {
  const now = new Date();
  const rows = await prisma.notice.findMany({ where: { deletedAt: null }, orderBy: { publishAt: 'desc' } });
  return Promise.all(
    rows.map(async (n) => {
      const people = await audienceOf(n);
      const read = await unscopedPrisma.noticeRead.count({
        where: { noticeId: n.id, userId: { in: people.map((p) => p.id) } },
      });
      return {
        ...n,
        state: n.publishAt > now ? 'scheduled' : n.expiresAt && n.expiresAt <= now ? 'expired' : 'live',
        audienceCount: people.length,
        readCount: read,
        results: n.pollOptions.length ? await tally(n.id, n.pollOptions.length) : null,
      };
    }),
  );
}

/** Who a notice is for, and who has not read it yet. */
export async function readReport(id: string) {
  const notice = await prisma.notice.findFirst({ where: { id, deletedAt: null } });
  if (!notice) throw new NoticeError(404, 'Notice not found');
  const people = await audienceOf(notice);
  const reads = await unscopedPrisma.noticeRead.findMany({ where: { noticeId: id } });
  const readers = new Set(reads.map((r) => r.userId));
  return {
    total: people.length,
    read: people.filter((p) => readers.has(p.id)).length,
    unread: people
      .filter((p) => !readers.has(p.id))
      .map((p) => ({ id: p.id, name: p.name, flats: p.flats }))
      .sort((a, b) => a.flats[0].localeCompare(b.flats[0], 'en', { numeric: true })),
  };
}

/** Sends the notice again to those who have not read it. */
export async function remindUnread(id: string) {
  const notice = await prisma.notice.findFirst({ where: { id, ...live() } });
  if (!notice) throw new NoticeError(404, 'Only a notice that is out can be sent again');
  const reads = await unscopedPrisma.noticeRead.findMany({ where: { noticeId: id }, select: { userId: true } });
  const readers = new Set(reads.map((r) => r.userId));
  const unread = (await audienceOf(notice)).filter((p) => !readers.has(p.id));
  await announce(notice, unread);
  return unread.length;
}
