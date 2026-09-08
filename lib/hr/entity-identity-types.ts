export type EntityIdentityView = {
  entity_id: string;
  legal_name: string;
  display_name: string;
  company_name: string;
  code?: string;
  entity_type?: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  website?: string;
  tax_identifier?: string;
  logo?: string;
  logo_url?: string | null;
  updated_at?: string;
};
