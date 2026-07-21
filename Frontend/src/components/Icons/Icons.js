'use client';
import React from 'react';
const e = React.createElement;
const svg = (d, extra = {}) => (props) =>
  e('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', ...extra, ...props },
    ...(Array.isArray(d) ? d : [d]).map(([tag, attrs], i) => e(tag, { ...attrs, key: i }))
  );

const Icons = {
  Home:        svg([['rect',{x:'3',y:'3',width:'7',height:'7'}],['rect',{x:'14',y:'3',width:'7',height:'7'}],['rect',{x:'14',y:'14',width:'7',height:'7'}],['rect',{x:'3',y:'14',width:'7',height:'7'}]]),
  Building:    svg([['path',{d:'M3 21h18M3 7h18M3 14h18M5 21V7m7 14V7m7 14V7'}]]),
  Users:       svg([['path',{d:'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'}],['circle',{cx:'9',cy:'7',r:'4'}],['path',{d:'M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'}]]),
  User:        svg([['path',{d:'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'}],['circle',{cx:'12',cy:'7',r:'4'}]]),
  Activity:    svg([['polyline',{points:'22 12 18 12 15 21 9 3 6 12 2 12'}]]),
  BarChart:    svg([['line',{x1:'18',y1:'20',x2:'18',y2:'10'}],['line',{x1:'12',y1:'20',x2:'12',y2:'4'}],['line',{x1:'6',y1:'20',x2:'6',y2:'14'}]]),
  Search:      svg([['circle',{cx:'11',cy:'11',r:'8'}],['line',{x1:'21',y1:'21',x2:'16.65',y2:'16.65'}]]),
  Filter:      svg([['polygon',{points:'22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3'}]]),
  Plus:        svg([['line',{x1:'12',y1:'5',x2:'12',y2:'19'}],['line',{x1:'5',y1:'12',x2:'19',y2:'12'}]]),
  Edit:        svg([['path',{d:'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7'}],['path',{d:'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z'}]]),
  Trash:       svg([['polyline',{points:'3 6 5 6 21 6'}],['path',{d:'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2'}]]),
  Close:       svg([['line',{x1:'18',y1:'6',x2:'6',y2:'18'}],['line',{x1:'6',y1:'6',x2:'18',y2:'18'}]]),
  Check:       svg([['polyline',{points:'20 6 9 17 4 12'}]]),
  ChevronDown: svg([['polyline',{points:'6 9 12 15 18 9'}]]),
  ChevronLeft: svg([['polyline',{points:'15 18 9 12 15 6'}]]),
  Chevron:     svg([['polyline',{points:'9 18 15 12 9 6'}]]),
  ChevronUp:   svg([['polyline',{points:'18 15 12 9 6 15'}]]),
  Bell:        svg([['path',{d:'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9'}],['path',{d:'M13.73 21a2 2 0 0 1-3.46 0'}]]),
  Mail:        svg([['path',{d:'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z'}],['polyline',{points:'22,6 12,13 2,6'}]]),
  Phone:       svg([['path',{d:'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.4a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.68h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.42a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z'}]]),
  RefreshCw:   svg([['polyline',{points:'23 4 23 10 17 10'}],['polyline',{points:'1 20 1 14 7 14'}],['path',{d:'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15'}]]),
  ExternalLink:svg([['path',{d:'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'}],['polyline',{points:'15 3 21 3 21 9'}],['line',{x1:'10',y1:'14',x2:'21',y2:'3'}]]),
  MapPin:      svg([['path',{d:'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z'}],['circle',{cx:'12',cy:'10',r:'3'}]]),
  Home2:       svg([['path',{d:'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'}],['polyline',{points:'9 22 9 12 15 12 15 22'}]]),
  Layers:      svg([['polygon',{points:'12 2 2 7 12 12 22 7 12 2'}],['polyline',{points:'2 17 12 22 22 17'}],['polyline',{points:'2 12 12 17 22 12'}]]),
  Tag:         svg([['path',{d:'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z'}],['line',{x1:'7',y1:'7',x2:'7.01',y2:'7'}]]),
  ArrowRight:  svg([['line',{x1:'5',y1:'12',x2:'19',y2:'12'}],['polyline',{points:'12 5 19 12 12 19'}]]),
  Sync:        svg([['polyline',{points:'23 4 23 10 17 10'}],['polyline',{points:'1 20 1 14 7 14'}],['path',{d:'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15'}]]),
  Settings:    svg([['circle',{cx:'12',cy:'12',r:'3'}],['path',{d:'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'}]]),
  LogOut:      svg([['path',{d:'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4'}],['polyline',{points:'16 17 21 12 16 7'}],['line',{x1:'21',y1:'12',x2:'9',y2:'12'}]]),
  Calendar:    svg([['rect',{x:'3',y:'4',width:'18',height:'18',rx:'2'}],['line',{x1:'16',y1:'2',x2:'16',y2:'6'}],['line',{x1:'8',y1:'2',x2:'8',y2:'6'}],['line',{x1:'3',y1:'10',x2:'21',y2:'10'}]]),
  Folder:      svg([['path',{d:'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'}]]),
  Upload:      svg([['path',{d:'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'}],['polyline',{points:'17 8 12 3 7 8'}],['line',{x1:'12',y1:'3',x2:'12',y2:'15'}]]),
  Image:       svg([['rect',{x:'3',y:'3',width:'18',height:'18',rx:'2'}],['circle',{cx:'8.5',cy:'8.5',r:'1.5'}],['polyline',{points:'21 15 16 10 5 21'}]]),
  Video:       svg([['polygon',{points:'23 7 16 12 23 17 23 7'}],['rect',{x:'1',y:'5',width:'15',height:'14',rx:'2',ry:'2'}]]),
  FileText:    svg([['path',{d:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'}],['polyline',{points:'14 2 14 8 20 8'}],['line',{x1:'16',y1:'13',x2:'8',y2:'13'}],['line',{x1:'16',y1:'17',x2:'8',y2:'17'}]]),
  Printer:     svg([['path',{d:'M6 9V2h12v7'}],['path',{d:'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2'}],['rect',{x:'6',y:'14',width:'12',height:'8'}]]),
  Bed:         svg([['rect',{x:'2',y:'11',width:'20',height:'7',rx:'1'}],['path',{d:'M4 11V7a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v4'}],['path',{d:'M2 18v2'}],['path',{d:'M22 18v2'}]]),
  Bath:        svg([['path',{d:'M4 12V5a2 2 0 0 1 4 0'}],['rect',{x:'2',y:'12',width:'20',height:'6',rx:'2'}],['path',{d:'M4 18v2'}],['path',{d:'M18 18v2'}]]),
  Maximize:    svg([['path',{d:'M8 3H5a2 2 0 0 0-2 2v3'}],['path',{d:'M21 8V5a2 2 0 0 0-2-2h-3'}],['path',{d:'M3 16v3a2 2 0 0 0 2 2h3'}],['path',{d:'M16 21h3a2 2 0 0 0 2-2v-3'}]]),
  Globe:       svg([['circle',{cx:'12',cy:'12',r:'10'}],['line',{x1:'2',y1:'12',x2:'22',y2:'12'}],['path',{d:'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'}]]),
  Hash:        svg([['line',{x1:'4',y1:'9',x2:'20',y2:'9'}],['line',{x1:'4',y1:'15',x2:'20',y2:'15'}],['line',{x1:'10',y1:'3',x2:'8',y2:'21'}],['line',{x1:'16',y1:'3',x2:'14',y2:'21'}]]),
  Copy:        svg([['rect',{x:'9',y:'9',width:'13',height:'13',rx:'2',ry:'2'}],['path',{d:'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'}]]),
  Star:        svg([['polygon',{points:'12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2'}]]),
  AlertTriangle: svg([['path',{d:'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'}],['line',{x1:'12',y1:'9',x2:'12',y2:'13'}],['line',{x1:'12',y1:'17',x2:'12.01',y2:'17'}]]),
  MessageCircle: svg([['path',{d:'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z'}]]),
};

export default Icons;
