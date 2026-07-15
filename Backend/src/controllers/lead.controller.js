import Lead from '../models/Lead.model.js';
import Activity from '../models/Activity.model.js';
import Property from '../models/Property.model.js';
import { sendLeadEmail } from '../utils/email.util.js';

export async function getLeads(req, res, next) {
  try {
    const { status, source, assignedTo, searchQuery, limit = 50, offset = 0 } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (source && source !== 'all') filter.source = source;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (searchQuery) {
      const q = searchQuery.trim();
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { propertyTitle: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
      ];
    }

    const [leads, total] = await Promise.all([
      Lead.find(filter).sort({ createdAt: -1 }).skip(parseInt(offset, 10)).limit(parseInt(limit, 10)).populate('assignedTo', 'name email').lean(),
      Lead.countDocuments(filter),
    ]);

    res.json({ meta: { total, limit: parseInt(limit, 10), offset: parseInt(offset, 10) }, objects: leads });
  } catch (error) {
    next(error);
  }
}

export async function getLeadById(req, res, next) {
  try {
    const lead = await Lead.findById(req.params.id).populate('assignedTo', 'name email').lean();
    if (!lead) return res.status(404).json({ message: 'Lead no encontrado' });
    res.json(lead);
  } catch (error) {
    next(error);
  }
}

export async function createLead(req, res, next) {
  try {
    const { name, email, phone, message, propertyId, source, assignedTo } = req.body;
    if (!name || !email) return res.status(400).json({ message: 'Nombre y email son requeridos' });

    let propertyTitle = '';
    if (propertyId) {
      const prop = await Property.findOne({ id: parseInt(propertyId, 10) }, { publication_title: 1, address: 1 }).lean();
      propertyTitle = prop?.publication_title || prop?.address || '';
    }

    const lead = await Lead.create({ name, email, phone, message, propertyId, propertyTitle, source, assignedTo });

    await Activity.create({
      type: 'lead_created',
      description: `Nuevo lead: ${name} (${email})${propertyTitle ? ` — ${propertyTitle}` : ''}`,
      userId: req.user?.id, userName: req.user?.name, userEmail: req.user?.email,
      entityId: lead._id.toString(), entityType: 'lead',
      meta: { leadId: lead._id, source, propertyId },
    });

    // Send email notification in background
    sendLeadEmail(lead, propertyTitle).catch(console.error);

    res.status(201).json(lead);
  } catch (error) {
    next(error);
  }
}

export async function updateLead(req, res, next) {
  try {
    const updates = { ...req.body };
    delete updates._id;

    const previous = await Lead.findById(req.params.id, { assignedTo: 1 }).lean();
    if (!previous) return res.status(404).json({ message: 'Lead no encontrado' });

    const lead = await Lead.findByIdAndUpdate(req.params.id, updates, { new: true }).populate('assignedTo', 'name email');
    if (!lead) return res.status(404).json({ message: 'Lead no encontrado' });

    const assignedChanged = 'assignedTo' in updates && String(previous.assignedTo || '') !== String(updates.assignedTo || '');
    if (assignedChanged && lead.assignedTo) {
      await Activity.create({
        type: 'lead_assigned',
        description: `${req.user.name} asignó el lead "${lead.name}" a ${lead.assignedTo.name}`,
        userId: req.user.id, userName: req.user.name, entityId: lead._id.toString(), entityType: 'lead',
        meta: { leadId: lead._id, assignedTo: lead.assignedTo._id },
      });
    } else {
      await Activity.create({
        type: 'lead_updated',
        description: `${req.user.name} actualizó lead: ${lead.name}`,
        userId: req.user.id, userName: req.user.name, entityId: lead._id.toString(), entityType: 'lead',
      });
    }

    res.json(lead);
  } catch (error) {
    next(error);
  }
}

export async function updateLeadStatus(req, res, next) {
  try {
    const { status } = req.body;
    const allowed = ['nuevo', 'en_progreso', 'contactado', 'reservado', 'cerrado', 'descartado'];
    if (!allowed.includes(status)) return res.status(400).json({ message: 'Estado inválido' });

    const lead = await Lead.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!lead) return res.status(404).json({ message: 'Lead no encontrado' });

    await Activity.create({
      type: 'lead_status_changed',
      description: `${req.user.name} cambió estado de lead "${lead.name}" a "${status}"`,
      userId: req.user.id, userName: req.user.name, entityId: lead._id.toString(), entityType: 'lead',
      meta: { newStatus: status },
    });

    res.json(lead);
  } catch (error) {
    next(error);
  }
}

export async function deleteLead(req, res, next) {
  try {
    await Lead.findByIdAndDelete(req.params.id);
    res.json({ message: 'Lead eliminado' });
  } catch (error) {
    next(error);
  }
}

export async function getLeadStats(req, res, next) {
  try {
    const [total, byStatus, bySource] = await Promise.all([
      Lead.countDocuments(),
      Lead.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Lead.aggregate([{ $group: { _id: '$source', count: { $sum: 1 } } }]),
    ]);
    res.json({ total, byStatus, bySource });
  } catch (error) {
    next(error);
  }
}
