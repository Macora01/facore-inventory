// ── Usuarios ──
export interface User {
  id: string;
  username: string;
  password?: string; // nunca se expone al frontend
  role: 'admin' | 'vendedora';
  displayName?: string;
  locationId?: string;
}

// ── Productos ──
export interface Product {
  id_venta: string;
  id_fabrica: string;
  description: string;
  price: number;
  cost: number;
  minStock?: number;
  image?: string;
  category?: string;
  supplierId?: string;
}

// ── Stock ──
export interface Stock {
  productId: string;
  locationId: string;
  quantity: number;
}

// ── Ubicaciones ──
export enum LocationType {
  WAREHOUSE = 'WAREHOUSE',
  FIXED_STORE_PERMANENT = 'FIXED_STORE_PERMANENT',
  FIXED_STORE_TEMPORARY = 'FIXED_STORE_TEMPORARY',
  MOBILE_STORE = 'MOBILE_STORE',
  ONLINE_STORE = 'ONLINE_STORE',
}

export const LOCATION_TYPE_LABEL: Record<LocationType, string> = {
  [LocationType.WAREHOUSE]: 'Bodega',
  [LocationType.FIXED_STORE_PERMANENT]: 'Tienda Fija',
  [LocationType.FIXED_STORE_TEMPORARY]: 'Tienda Temporal',
  [LocationType.MOBILE_STORE]: 'Feria / Móvil',
  [LocationType.ONLINE_STORE]: 'Online',
};

export interface Location {
  id: string;
  name: string;
  type: LocationType;
  address?: string;
  isActive?: boolean;
}

// ── Movimientos ──
export enum MovementType {
  INITIAL_LOAD = 'INITIAL_LOAD',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
  SALE = 'SALE',
  ADJUSTMENT = 'ADJUSTMENT',
  REVERSION = 'REVERSION',
}

export const MOVEMENT_TYPE_LABEL: Record<MovementType, string> = {
  [MovementType.INITIAL_LOAD]: 'Carga Inicial',
  [MovementType.TRANSFER_IN]: 'Entrada',
  [MovementType.TRANSFER_OUT]: 'Salida',
  [MovementType.SALE]: 'Venta',
  [MovementType.ADJUSTMENT]: 'Ajuste',
  [MovementType.REVERSION]: 'Reversión',
};

export interface Movement {
  id: string;
  productId: string;
  fromLocationId?: string;
  toLocationId?: string;
  quantity: number;
  type: MovementType;
  reason?: string;
  timestamp: string;
  relatedFile?: string;
  price?: number;
  cost?: number;
  createdBy?: string;
}

// ── Órdenes de Compra ──
export enum PurchaseOrderStatus {
  ORDERED = 'ordered',
  SHIPPED = 'shipped',
  RECEIVED = 'received',
  PARTIAL = 'partial',
  CANCELLED = 'cancelled',
}

export const PURCHASE_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  [PurchaseOrderStatus.ORDERED]: 'Pedido',
  [PurchaseOrderStatus.SHIPPED]: 'En tránsito',
  [PurchaseOrderStatus.RECEIVED]: 'Recibido',
  [PurchaseOrderStatus.PARTIAL]: 'Parcial',
  [PurchaseOrderStatus.CANCELLED]: 'Cancelado',
};

export interface PurchaseOrder {
  id: string;
  supplierName: string;
  orderDate?: string;
  expectedArrival?: string;
  receivedDate?: string;
  status: PurchaseOrderStatus;
  totalCost?: number;
  notes?: string;
  items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
  orderId: string;
  productId: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost?: number;
}

// ── Ventas Pendientes ──
export enum PendingSaleStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export interface PendingSale {
  id: string;
  productId: string;
  locationId: string;
  quantity: number;
  price: number;
  sellerUsername: string;
  status: PendingSaleStatus;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
}

// ── CSV ──
export interface ParsedInitialInventory {
  id_venta: string;
  price: number;
  cost: number;
  id_fabrica: string;
  qty: number;
  description: string;
}

export interface ParsedTransfer {
  sitio_inicial: string;
  sitio_final: string;
  id_venta: string;
  qty: number;
}

export interface ParsedSale {
  timestamp: string;
  lugar: string;
  cod_fabrica: string;
  cod_venta: string;
  description: string;
  precio: number;
  qty: number;
}

// ── Trazabilidad ──
export interface TraceabilitySummary {
  product: Product;
  totalPurchased: number;
  totalInStock: number;
  totalSold: number;
  stockByLocation: { locationId: string; locationName: string; quantity: number }[];
  salesByLocation: { locationId: string; locationName: string; quantity: number; percentage: number }[];
  history: Movement[];
}
