import Property from '../models/Property.model.js';
import Activity from '../models/Activity.model.js';

// Quién cargó cada reserva vieja. Hasta el 13/11 las reservas se guardaban reescribiendo la lista
// entera y no guardaban autor. Pero cada reserva nueva recibía su _id en el mismo guardado que
// dejaba en Actividad «X cambió Reservas de la propiedad», y el _id lleva la fecha de creación:
// se cruzan los dos para recuperar el autor. Las del Excel se atribuyen a quien hizo la importación.
// Corre al arrancar y solo toca reservas sin autor.
export async function backfillBookingAuthors() {
  const props = await Property.find(
    { 'temporaryRental.bookings': { $elemMatch: { createdByName: { $in: [null, ''] } } } },
    { id: 1, 'temporaryRental.bookings._id': 1, 'temporaryRental.bookings.createdByName': 1 },
  ).lean();
  if (!props.length) return 0;

  const imports = await Activity.find({ type: 'rentals_imported' }, { userId: 1, userName: 1, createdAt: 1 }).lean();
  let fixed = 0;
  for (const p of props) {
    const edits = await Activity.find(
      { type: 'property_updated', entityId: String(p.id), 'meta.changes.path': 'temporaryRental.bookings' },
      { userId: 1, userName: 1, createdAt: 1 },
    ).lean();
    for (const b of p.temporaryRental?.bookings || []) {
      if (b.createdByName || !b._id?.getTimestamp) continue;
      const ts = b._id.getTimestamp().getTime();
      const near = (list, maxMs) => list
        .map((a) => ({ a, d: new Date(a.createdAt).getTime() - ts }))
        .filter((x) => x.d >= -2000 && x.d <= maxMs)
        .sort((x, y) => Math.abs(x.d) - Math.abs(y.d))[0]?.a;
      const who = near(edits, 30 * 1000) || near(imports, 10 * 60 * 1000);
      if (!who?.userName) continue;
      await Property.collection.updateOne(
        { id: p.id },
        { $set: {
          'temporaryRental.bookings.$[b].createdById': who.userId || null,
          'temporaryRental.bookings.$[b].createdByName': who.userName,
          'temporaryRental.bookings.$[b].createdAt': new Date(ts),
        } },
        { arrayFilters: [{ 'b._id': b._id }] },
      );
      fixed += 1;
    }
  }
  if (fixed) console.log(`[reservas] autor recuperado en ${fixed} reservas viejas`);
  return fixed;
}
