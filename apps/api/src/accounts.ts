// Connexion Google / Discord : rattache les cartes et les Rubis de l'invité au compte.
import type { PrismaClient, User } from '@prisma/client';

export interface Identity {
  provider: 'google' | 'discord' | 'dev';
  providerId: string;
  name: string;
}

export async function attachIdentity(db: PrismaClient, guestId: string | null, id: Identity): Promise<User> {
  return db.$transaction(async (tx) => {
    const account = await tx.user.findUnique({
      where: { provider_providerId: { provider: id.provider, providerId: id.providerId } },
    });
    const guest = guestId ? await tx.user.findUnique({ where: { id: guestId } }) : null;
    const usableGuest = guest?.isGuest && guest.id !== account?.id ? guest : null;

    if (!account) {
      // premier passage : l'invité devient le compte
      if (usableGuest)
        return tx.user.update({
          where: { id: usableGuest.id },
          data: { provider: id.provider, providerId: id.providerId, isGuest: false, displayName: id.name },
        });
      return tx.user.create({
        data: { provider: id.provider, providerId: id.providerId, isGuest: false, displayName: id.name },
      });
    }
    if (!usableGuest) return account;

    // compte existant : on y verse la collection de l'invité, puis l'invité disparaît
    await tx.cardInstance.updateMany({ where: { ownerId: usableGuest.id }, data: { ownerId: account.id } });
    await tx.ledgerEntry.updateMany({ where: { userId: usableGuest.id }, data: { userId: account.id } });
    await tx.deck.updateMany({ where: { userId: usableGuest.id }, data: { userId: account.id } });
    await tx.user.delete({ where: { id: usableGuest.id } });
    return tx.user.update({
      where: { id: account.id },
      data: {
        rubis: { increment: usableGuest.rubis },
        boostersOpened: { increment: usableGuest.boostersOpened },
      },
    });
  });
}
