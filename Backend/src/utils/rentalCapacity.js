// Capacidad de personas de un alquiler temporario, para la web pública.
// En el CRM la capacidad se carga como texto libre (temporaryRental.capacity: "6", "8-10")
// y casi siempre solo está el grupo (capacityGroup: '1-4' | '5-7' | '8-12'). Tokko a veces
// trae guests_amount. Se toma el dato más preciso disponible, en ese orden.
//   max   -> número para filtrar ("entran N personas" <=> max >= N)
//   label -> texto para mostrar, sin prometer más de lo cargado ("Hasta 6", "8 a 10")
function numbersIn(text) {
  return String(text || '').match(/\d+/g)?.map(Number).filter((n) => n > 0 && n < 100) || [];
}

export function getRentalCapacity(temporaryRental, guestsAmount) {
  const fromText = numbersIn(temporaryRental?.capacity);
  if (fromText.length) {
    const min = Math.min(...fromText);
    const max = Math.max(...fromText);
    return { max, label: min === max ? `Hasta ${max} personas` : `${min} a ${max} personas` };
  }
  if (guestsAmount > 0) return { max: guestsAmount, label: `Hasta ${guestsAmount} personas` };
  const fromGroup = numbersIn(temporaryRental?.capacityGroup);
  if (fromGroup.length) {
    const max = Math.max(...fromGroup);
    return { max, label: `${Math.min(...fromGroup)} a ${max} personas` };
  }
  return { max: null, label: '' };
}

