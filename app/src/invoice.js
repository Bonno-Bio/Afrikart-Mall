/**
 * VAT invoices.
 *
 * Botswana VAT is 14% and our prices are VAT-inclusive, so an invoice shows the
 * VAT *contained* in the total, not added to it. The invoice row is immutable
 * once written (database trigger), because an invoice that can be edited after
 * the fact is not evidence of anything.
 *
 * Note the two different meanings of "subtotal" in the schema, which is worth
 * being explicit about: `orders.subtotal_minor` is the gross value of the goods
 * (what the customer saw on the item), while `invoices.subtotal_minor` is net
 * of VAT, so that subtotal + vat = total exactly as an invoice must.
 */

/** Issue (or return the existing) invoice for an order. Safe to call twice. */
export async function issueInvoice(db, orderId) {
  const order = await db.query(`select total_minor, vat_minor from orders where id = $1`, [orderId]);
  const o = order.rows[0];
  if (!o) throw new Error('Cannot invoice an order that does not exist.');

  const total = Number(o.total_minor);
  const vat = Number(o.vat_minor);

  const inserted = await db.query(
    `insert into invoices (order_id, subtotal_minor, vat_minor, total_minor)
     values ($1, $2, $3, $4)
     on conflict (order_id) do nothing
     returning invoice_number, issued_at, subtotal_minor, vat_minor, total_minor`,
    [orderId, total - vat, vat, total],
  );
  if (inserted.rows.length > 0) return inserted.rows[0];

  const existing = await db.query(
    `select invoice_number, issued_at, subtotal_minor, vat_minor, total_minor
       from invoices where order_id = $1`,
    [orderId],
  );
  return existing.rows[0];
}

/**
 * A printable invoice. Text now, PDF later — the numbers are the point, the
 * container is a detail.
 */
export function renderInvoice({ order, lines, invoice, seller }) {
  const money = (minor) => `P${(minor / 100).toFixed(2)}`;
  const row = (label, value) => `${String(label).slice(0, 42).padEnd(44)}${money(value).padStart(12)}`;

  const address = order.shipping_address ?? {};
  const body = [
    'AFRIKART MALL (PTY) LTD',
    'Gaborone, Botswana',
    'VAT No. BW0000000000',
    '',
    `TAX INVOICE   ${invoice.invoice_number}`,
    `Order         ${order.order_number}`,
    `Date          ${new Date(invoice.issued_at).toISOString().slice(0, 10)}`,
    `Customer      ${address.recipient ?? ''}`,
    `Address       ${[address.line1, address.suburb, address.city].filter(Boolean).join(', ')}`,
    '',
    `${'Item'.padEnd(44)}${'Amount'.padStart(12)}`,
    '-'.repeat(56),
  ];

  for (const line of lines) {
    body.push(row(`${line.quantity} x ${line.title_snapshot}`, Number(line.line_subtotal_minor)));
  }

  if (Number(order.delivery_minor) > 0) body.push(row('Delivery', Number(order.delivery_minor)));
  if (Number(order.cod_fee_minor) > 0) body.push(row('Cash-on-delivery handling', Number(order.cod_fee_minor)));

  body.push(
    '-'.repeat(56),
    row('Subtotal (excl. VAT)', Number(invoice.subtotal_minor)),
    row('VAT @ 14%', Number(invoice.vat_minor)),
    row('TOTAL', Number(invoice.total_minor)),
    '',
    'Prices include VAT at 14%.',
  );
  if (seller) body.push(`Fulfilled by ${seller}`);

  return body.join('\n');
}
