import Activity from '../models/Activity.model.js';

export async function getActivities(req, res, next) {
  try {
    const { limit = 50, offset = 0, type, entityType } = req.query;
    const filter = {};
    if (type && type !== 'all') {
      const types = String(type).split(',').map((t) => t.trim()).filter(Boolean);
      filter.type = types.length > 1 ? { $in: types } : types[0];
    }
    if (entityType && entityType !== 'all') filter.entityType = entityType;

    const [activities, total] = await Promise.all([
      Activity.find(filter).sort({ createdAt: -1 }).skip(parseInt(offset, 10)).limit(parseInt(limit, 10)).lean(),
      Activity.countDocuments(filter),
    ]);

    res.json({ meta: { total, limit: parseInt(limit, 10), offset: parseInt(offset, 10) }, objects: activities });
  } catch (error) {
    next(error);
  }
}
