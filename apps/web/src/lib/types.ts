// API contract types. Mirrors ARCHITECTURE.md at repo root. Money is always a decimal string ("1290.000").

export type UUID = string;
export type ISODate = string;
export type Money = string;
export type Currency = "TND" | (string & {});

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

// ---------- Auth / RBAC ----------
export interface User {
  id: UUID;
  email: string;
  full_name: string;
  roles: string[];
  permissions: string[];
  is_active: boolean;
  created_at: ISODate;
  last_login_at: ISODate | null;
}
export interface Role {
  name: string;
  description: string;
  permissions: string[];
}
export interface Permission {
  code: string;
  description: string;
}

// ---------- Agents ----------
export type AgentId = "sales" | "intelligence" | "payment" | "analyst" | "strategy" | "security" | "orchestrator";

export interface AgentView {
  id: AgentId;
  name: string;
  description: string;
  icon: string;
  status: string;
  current_task: string | null;
  last_run_at: ISODate | null;
  enabled: boolean;
  provider: string;
  model: string;
  temperature: number;
  tools: string[];
  responsibilities: string[];
  stats: { succeeded: number; failed: number; avg_ms: number };
}
/** GET /agents/{id} adds the system prompt. Backend returns null provider/model until configured. */
export interface AgentDetail extends AgentView {
  system_prompt?: string;
}
export interface AgentPermissions {
  allowed_tools: string[];
  forbidden_tools: string[];
}

export type ExecutionStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | (string & {});
export interface Execution {
  id: UUID;
  agent_id: AgentId;
  workflow_id: UUID | null;
  task_type: string;
  triggered_by: string;
  status: ExecutionStatus;
  input_summary: string | null;
  output_summary: string | null;
  output: unknown;
  provider: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  attempts: number;
  error: string | null;
  started_at: ISODate;
  completed_at: ISODate | null;
  duration_ms: number | null;
}

// ---------- Workflows ----------
export const WORKFLOW_STATES = [
  "NEW_CUSTOMER",
  "SALES_INTERACTION",
  "CUSTOMER_ANALYSIS",
  "PRODUCT_RECOMMENDATION",
  "ENROLLMENT_REQUEST",
  "SECURITY_CHECK",
  "PAYMENT_SESSION",
  "PAYMENT_PROCESSING",
  "AWAITING_APPROVAL",
  "PAYMENT_FAILED",
  "FINANCIAL_ANALYSIS",
  "BUSINESS_RECOMMENDATION",
  "COMPLETED",
  "BLOCKED",
  "CANCELLED",
  "LOW_INTENT",
  "ERROR",
] as const;
export type WorkflowState = (typeof WORKFLOW_STATES)[number];

export interface Workflow {
  id: UUID;
  kind: string;
  label: string;
  state: WorkflowState;
  customer_id: UUID | null;
  customer_name: string | null;
  conversation_id: UUID | null;
  transaction_id: UUID | null;
  context: Record<string, unknown>;
  error: string | null;
  created_at: ISODate;
  updated_at: ISODate;
}
export interface WorkflowStep {
  id: UUID;
  from_state: WorkflowState | null;
  to_state: WorkflowState;
  agent_id: AgentId | null;
  note: string | null;
  created_at: ISODate;
}
export interface AgentMessage {
  id: UUID;
  from_agent: AgentId;
  to_agent: AgentId;
  message_type: string;
  payload: Record<string, unknown>;
  created_at: ISODate;
}
export interface WorkflowDetail extends Workflow {
  steps: WorkflowStep[];
  executions: Execution[];
  messages: AgentMessage[];
  approvals: Approval[];
}

// ---------- Events ----------
export type EventType =
  | "agent.started"
  | "agent.completed"
  | "agent.failed"
  | "workflow.started"
  | "workflow.updated"
  | "workflow.completed"
  | "payment.created"
  | "payment.updated"
  | "security.alert"
  | "approval.requested"
  | "approval.resolved"
  | "customer.message"
  | "analytics.updated";

export interface AppEvent {
  id: number;
  type: EventType;
  agent_id: AgentId | null;
  workflow_id: UUID | null;
  summary: string;
  data: Record<string, unknown>;
  created_at: ISODate;
}

// ---------- Public ----------
export interface Offer {
  id: UUID;
  slug: string;
  name: string;
  category: string;
  summary: string;
  description: string;
  price: Money;
  currency: Currency;
  duration_weeks: number;
  level: string;
  learning_outcomes: string[];
  target_audience: string;
  seats_total: number;
  seats_left: number;
  status: string;
}
export type OfferCard = Pick<Offer, "id" | "slug" | "name" | "price" | "currency" | "duration_weeks" | "level">;

export interface PublicMessage {
  id: UUID;
  role: "customer" | "agent" | "system";
  content: string;
  created_at: ISODate;
  meta: {
    products?: OfferCard[];
    cta?: { type: "enroll"; product_id: UUID; label: string };
    notice?: string;
  };
}
export interface StartConversationRequest {
  full_name?: string;
  email?: string;
  consent_voice: boolean;
  channel: "text" | "voice";
}
export interface StartConversationResponse {
  conversation_id: UUID;
  access_token: string;
  messages: PublicMessage[];
}
export interface ConversationMessagesResponse {
  conversation_id?: UUID;
  messages: PublicMessage[];
}
export interface CheckoutSession {
  session_id: UUID;
  status: string;
  amount: Money;
  currency: Currency;
  product: OfferCard;
  order_reference: string;
  test_methods: { id: string; label: string }[];
  simulated: true;
  failure_reason?: string | null;
  transaction_reference?: string | null;
  expires_at?: ISODate | null;
}
export type PayStatus = "SUCCEEDED" | "FAILED" | "REQUIRES_APPROVAL" | "BLOCKED";
export interface PayResponse {
  status: PayStatus;
  message: string;
  transaction_reference: string;
  idempotent_replay?: boolean;
}

// ---------- Demo ----------
export type DemoScenarioId =
  | "successful_journey"
  | "failed_payment"
  | "suspicious_activity"
  | "prompt_injection"
  | "business_intelligence";
export interface DemoScenario {
  id: DemoScenarioId;
  title: string;
  description: string;
  steps: string[];
}
export interface DemoRunResult {
  scenario_id?: DemoScenarioId;
  workflow_id: UUID | null;
  summary: string;
  details: Record<string, unknown>;
}

// ---------- Conversations / Customers ----------
export interface Conversation {
  id: UUID;
  customer_id: UUID | null;
  customer_name?: string | null;
  channel: "text" | "voice";
  status?: string;
  created_at: ISODate;
  updated_at?: ISODate;
  messages?: PublicMessage[];
  insight?: Insight | null;
  workflow?: Workflow | null;
}

export interface Customer {
  id: UUID;
  full_name: string;
  email: string | null;
  segment: string | null;
  city: string | null;
  journey_stage: string | null;
  created_at: ISODate;
  purchase_intent: number | null;
  sentiment_label: string | null;
  objections: string[];
  orders_count: number;
  total_spent: Money;
}
export interface CustomerHistory {
  conversations: Conversation[];
  orders: Order[];
  transactions: Transaction[];
  enrollments: Enrollment[];
}
export interface Insight {
  id: UUID;
  conversation_id: UUID;
  summary: string;
  needs: string[];
  motivations: string[];
  interests: string[];
  preferred_product_ids: UUID[];
  objections: string[];
  satisfaction_signals: string[];
  sentiment_score: number;
  sentiment_label: string;
  purchase_intent: number;
  hesitation: boolean;
  journey_stage: string;
  recommended_follow_up: string | null;
  confidence: number;
  source: string;
  updated_at: ISODate;
}

// ---------- Products / Orders ----------
export interface Product extends Offer {
  keywords: string[];
  created_at: ISODate;
  updated_at: ISODate;
  stats: { revenue: Money; sales: number; seats_taken: number };
}

export interface OrderItem {
  product_id: UUID;
  product_name: string;
  unit_price: Money;
  quantity: number;
}
export interface Order {
  id: UUID;
  reference: string;
  status: string;
  total: Money;
  currency: Currency;
  customer: { id: UUID; full_name: string };
  items: OrderItem[];
  transaction: { id: UUID; reference: string; status: TransactionStatus } | null;
  created_at: ISODate;
}
export interface OrderDetail extends Order {
  timeline: { status?: string; note?: string; created_at: ISODate; [k: string]: unknown }[];
}
export interface Enrollment {
  id: UUID;
  customer_id: UUID;
  product_id: UUID;
  order_id?: UUID | null;
  status: string;
  created_at: ISODate;
  [k: string]: unknown;
}

// ---------- Payments ----------
export type TransactionStatus =
  | "CREATED"
  | "PENDING"
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED"
  | "REQUIRES_APPROVAL"
  | "CANCELLED"
  | "REFUNDED";

export interface Transaction {
  id: UUID;
  reference: string;
  status: TransactionStatus;
  amount: Money;
  currency: Currency;
  provider: string;
  payment_method: string | null;
  failure_reason: string | null;
  risk_score: number | null;
  risk_flags: string[];
  customer: { id: UUID; full_name: string };
  product: { id: UUID; name: string };
  created_at: ISODate;
  completed_at: ISODate | null;
}
export interface TransactionDetail extends Transaction {
  attempts: Record<string, unknown>[];
  history: { from_status?: string; to_status?: string; note?: string; created_at: ISODate; [k: string]: unknown }[];
  security_events: SecurityEvent[];
  refunds: Record<string, unknown>[];
  approvals: Approval[];
}
export interface PaymentSession {
  id: UUID;
  order_id: UUID;
  status: string;
  amount: Money;
  currency: Currency;
  [k: string]: unknown;
}

// ---------- Analytics ----------
export interface OverviewKpis {
  interactions: number;
  customers_engaged: number;
  interested_customers: number;
  enrollments: number;
  conversion_rate: number;
  revenue: Money;
  refunded: Money;
  currency: Currency;
  payments: Partial<Record<TransactionStatus, number>>;
  pending_payments: number;
  avg_transaction_value: Money;
  satisfaction: number | null;
  feedback_count: number;
  security_alerts: number;
  high_risk_events: number;
  open_security_events: number;
  security_event_types: Record<string, number>;
  top_products: { product_id?: UUID; name: string; revenue?: Money; sales?: number; [k: string]: unknown }[];
  top_objections: { objection?: string; label?: string; count: number; [k: string]: unknown }[];
}
export interface RevenuePoint {
  date: string;
  revenue: Money;
  succeeded: number;
  failed: number;
}
export interface ConversionFunnel {
  funnel: { stage: string; customers: number }[];
  conversion_rate: number;
}
export interface CustomerAnalytics {
  sentiment: Record<string, number> | unknown;
  interests: unknown;
  intent: unknown;
  objections: unknown;
  segments: unknown;
}
export interface AnalyticsFilters {
  date_from?: string;
  date_to?: string;
  product_id?: UUID;
  segment?: string;
}

// ---------- Security ----------
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type SecurityEventStatus = "OPEN" | "INVESTIGATING" | "RESOLVED" | "DISMISSED";
export interface SecurityEvent {
  id: UUID;
  event_type: string;
  category: string;
  severity: Severity;
  description: string;
  risk_score: number | null;
  recommended_action: string | null;
  status: SecurityEventStatus;
  detector: string;
  customer_id: UUID | null;
  transaction_id: UUID | null;
  agent_id: AgentId | null;
  evidence: Record<string, unknown> | null;
  explanation: string | null;
  resolved_at: ISODate | null;
  resolution_note: string | null;
  created_at: ISODate;
}

export interface SecurityOverview {
  total: number;
  by_severity: Partial<Record<Severity, number>>;
  by_status: Partial<Record<SecurityEventStatus, number>>;
  by_category: Record<string, number>;
  recent: SecurityEvent[];
}
export interface InjectionVerdict {
  detected: boolean;
  score: number;
  patterns: string[];
  verdict: "INJECTION" | "CLEAN";
}

// ---------- Approvals ----------
export type ApprovalStatus =
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "INFORMATION_REQUESTED"
  | "INFO_REQUESTED"
  | "EXPIRED"
  | (string & {});
export interface ApprovalDecision {
  decision: string;
  decided_by_email: string;
  notes: string | null;
  created_at: ISODate;
}
export interface Approval {
  id: UUID;
  action: string;
  status: ApprovalStatus;
  reason: string;
  requested_by_agent: AgentId | null;
  requested_by_user: string | null;
  customer: { id: UUID; full_name: string } | null;
  transaction: { id: UUID; reference: string; amount: Money; status: TransactionStatus } | null;
  risk_score: number | null;
  risk_flags: string[];
  expires_at: ISODate | null;
  created_at: ISODate;
  decisions: ApprovalDecision[];
  security_event_id?: UUID | null;
  payload?: Record<string, unknown>;
}
/** GET /approvals/{id}: approval plus resolved context. */
export interface ApprovalDetail extends Approval {
  context?: {
    transaction: Transaction | null;
    customer: Customer | null;
    security_event: SecurityEvent | null;
  };
}

// ---------- Strategy ----------
export interface Recommendation {
  id: UUID;
  rule_key: string;
  title: string;
  description: string;
  category: string;
  observed_facts: string[];
  hypothesis: string;
  metrics: Record<string, unknown>;
  expected_impact: string;
  priority: string;
  confidence: number;
  suggested_action: string;
  requires_approval: boolean;
  status: string;
  feedback: "ACCEPTED" | "REJECTED" | "DEFERRED" | null;
  feedback_note: string | null;
  source: string;
  created_at: ISODate;
}

// ---------- Audit ----------
export interface AuditLog {
  id: number;
  created_at: ISODate;
  actor_type: string;
  actor_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  severity: string;
  outcome: string;
  details: Record<string, unknown>;
  ip: string | null;
  hash: string;
  prev_hash?: string | null;
}
export interface AuditVerify {
  ok: boolean;
  first_broken_id: number | null;
}

// ---------- Settings ----------
export interface AppSettings {
  ai: { provider: string; default_model: string; anthropic_configured: boolean; openai_configured: boolean; gemini_configured?: boolean };
  payments: Record<string, unknown>;
  voice: { stt: "browser"; tts: "browser" };
  environment: string;
}
