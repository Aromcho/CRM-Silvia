'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import { photoSrc } from '@/lib/data';
import {
  nightsBetween, capacityInfo, propertyTitle, whatsappHref, bookingTiming, longDay, nightsLabel, useEscape,
} from './rentalUtils';
import './ReservaDetalle.css';

const e = React.createElement;
const { useCallback } = React;

// Vista de una reserva (se abre al tocar una tarjeta de la lista de Reservas)
export default function ReservaDetalle({ property: p, booking: b, onClose, onEdit, onOpenProperty, onDelete, onReceipt }) {
  const rental = p.temporaryRental || {};
  const blocked = b.status === 'bloqueado';
  const timing = bookingTiming(b);
  const nights = nightsBetween(b.startDate, b.endDate);
  const wa = whatsappHref(b.guestPhone);
  const tel = b.guestPhone ? `tel:${String(b.guestPhone).replace(/[^\d+]/g, '')}` : null;
  const cap = capacityInfo(p);
  const src = photoSrc(p.photos?.[0]);
  const title = b.guestName?.trim() || (blocked ? 'Fechas bloqueadas' : 'Reserva sin nombre');

  // Escape cierra, salvo que haya arriba un diálogo (confirmación de borrado o el recibo)
  const closeOnEscape = useCallback(() => {
    if (!document.querySelector('.confirm-overlay, .recibo-overlay')) onClose();
  }, [onClose]);
  useEscape(closeOnEscape);

  return e('div', { className: 'prop-modal-overlay', onClick: onClose },
    e('div', { className: 'prop-modal res-detail', role: 'dialog', 'aria-modal': true, 'aria-label': `Reserva: ${title}`, onClick: (ev) => ev.stopPropagation() },
      e('div', { className: 'prop-modal-head res-detail-head' },
        e('div', { className: 'res-detail-heading' },
          e('div', { className: 'res-detail-badges' },
            e('span', { className: `status-badge badge-${blocked ? 'vendida' : 'reservada'}` }, blocked ? 'Bloqueado' : 'Reservado'),
            timing && e('span', { className: `booking-timing ${timing.key}` }, timing.label),
          ),
          e('h2', null, title),
        ),
        e('button', { type: 'button', className: 'btn ghost sm modal-close', onClick: onClose, 'aria-label': 'Cerrar' }, e(Icons.Close, { width: 14, height: 14 })),
      ),

      e('div', { className: 'prop-modal-body res-detail-body' },
        e('div', { className: 'rd-stay' },
          e('div', { className: 'rd-when in' },
            e('span', { className: 'rd-when-label' }, e(Icons.LogIn, { width: 13, height: 13 }), 'Entrada'),
            e('strong', null, longDay(b.startDate)),
          ),
          e('div', { className: 'rd-nights' }, e('span', null, nightsLabel(nights))),
          e('div', { className: 'rd-when out' },
            e('span', { className: 'rd-when-label' }, e(Icons.LogOut, { width: 13, height: 13 }), 'Salida'),
            e('strong', null, longDay(b.endDate)),
          ),
        ),

        (b.guestName || b.guestPhone) && e('section', { className: 'rd-section' },
          e('h3', null, 'Huésped'),
          e('div', { className: 'rd-guest' },
            e('div', { className: 'rd-guest-name' }, e(Icons.User, { width: 14, height: 14 }), b.guestName || 'Sin nombre'),
            b.guestPhone && e('div', { className: 'rd-guest-phone' },
              e('span', null, b.guestPhone),
              wa && e('a', { className: 'rd-contact wa', href: wa, target: '_blank', rel: 'noopener noreferrer' }, e(Icons.WhatsApp, { width: 14, height: 14 }), 'WhatsApp'),
              tel && e('a', { className: 'rd-contact call', href: tel }, e(Icons.Phone, { width: 13, height: 13 }), 'Llamar'),
            ),
          ),
        ),

        b.notes?.trim() && e('section', { className: 'rd-section' },
          e('h3', null, 'Notas'),
          e('p', { className: 'rd-notes' }, b.notes),
        ),

        e('section', { className: 'rd-section' },
          e('h3', null, 'Propiedad'),
          e('button', { type: 'button', className: 'rd-property', onClick: () => onOpenProperty(p), title: 'Abrir la propiedad' },
            src ? e('img', { src, alt: '', loading: 'lazy' }) : e('span', { className: 'rd-noimg' }, e(Icons.Building, { width: 18, height: 18 })),
            e('span', { className: 'rd-property-text' },
              e('span', { className: 'rd-property-title' }, propertyTitle(p)),
              e('span', { className: 'rd-property-sub' }, [p.address, rental.localidad].filter(Boolean).join(' · ')),
              cap && e('span', { className: 'rd-property-sub' }, e(Icons.Users, { width: 11, height: 11 }), cap.short),
            ),
            e(Icons.Chevron, { width: 15, height: 15 }),
          ),
          (rental.alarmCode || rental.ownerPhone) && e('div', { className: 'rd-ops' },
            rental.alarmCode && e('div', null, e('span', null, e(Icons.Key, { width: 12, height: 12 }), 'Clave de alarma'), e('strong', null, rental.alarmCode)),
            rental.ownerPhone && e('div', null, e('span', null, e(Icons.Phone, { width: 12, height: 12 }), 'Teléfono del dueño'), e('strong', null, rental.ownerPhone)),
          ),
        ),
      ),

      e('div', { className: 'res-detail-foot' },
        e('button', { type: 'button', className: 'btn primary', onClick: () => onReceipt(p, b) },
          e(Icons.Download, { width: 15, height: 15 }), 'Descargar recibo de reserva'),
        e('div', { className: 'res-detail-secondary' },
          e('button', { type: 'button', className: 'btn ghost sm', onClick: () => onEdit(p, b) }, e(Icons.Edit, { width: 13, height: 13 }), 'Editar reserva'),
          e('button', { type: 'button', className: 'btn ghost sm rd-delete', onClick: () => onDelete(p, b) }, e(Icons.Trash, { width: 13, height: 13 }), 'Eliminar'),
        ),
      ),
    ),
  );
}
