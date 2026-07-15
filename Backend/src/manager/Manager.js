class Manager {
  constructor(Model) {
    this.Model = Model;
  }

  create(data) { return this.Model.create(data); }
  read(filter = {}, projection = null) { return projection ? this.Model.find(filter, projection) : this.Model.find(filter); }
  readOne(id) { return this.Model.findById(id); }
  readByCustomId(id) { return this.Model.findOne({ id: parseInt(id, 10) }); }
  update(id, data) { return this.Model.findByIdAndUpdate(id, data, { new: true }); }
  destroy(id) { return this.Model.findByIdAndDelete(id); }
  readByEmail(email) { return this.Model.findOne({ email }); }

  paginate({ filter = {}, opts = {}, projection, lean = false }) {
    // leanWithId (default true en mongoose-paginate-v2) sobreescribe doc.id con el _id de Mongo,
    // pisando el campo `id` numerico propio del modelo (ej. Property.id de Tokko).
    const options = { ...opts, lean, leanWithId: false };
    if (projection) options.select = projection;
    return this.Model.paginate(filter, options);
  }

  aggregate(pipeline) { return this.Model.aggregate(pipeline); }
}

export default Manager;
