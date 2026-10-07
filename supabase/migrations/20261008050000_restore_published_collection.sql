begin;
-- Restore only the previously published collection changed by the proposal migration.
-- Drafts submitted by sellers and archived products keep their existing status.
alter table public.products disable trigger validate_cooperative_publication;
update public.products set status='approved',review_note=null,updated_at=now()
where id between 1 and 12 and status='pending' and deleted_at is null
 and review_note='Lengkapi data kain asli Sambas, nama pembuat, cerita, ukuran, bahan, motif, dan foto sebelum ditayangkan.';
alter table public.products enable trigger validate_cooperative_publication;
commit;
