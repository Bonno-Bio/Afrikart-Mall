import { Link } from 'react-router-dom'
import { Icon } from '../components/icons'

const FAQ = [
  ['How fast is delivery?', 'Afrikart Express is next-day for Gaborone, Tlokweng and Mogoditshane when you order before 17:00. Upcountry towns are 2 to 5 working days by courier or intercity combi.'],
  ['What does delivery cost?', 'P30 for Express, P20 for standard courier, P10 to collect at any of our 16 pickup points. Free above P400. Cash on delivery adds P15 handling.'],
  ['Can I pay cash?', 'Yes, in Gaborone, Tlokweng and Mogoditshane. Everywhere else we take card, Orange Money, MyZaka, Smega or a bank transfer, because a failed cash drop costs the whole trip twice.'],
  ['How do returns work?', 'Request the return in your account within 7 days. A rider collects from your door within 48 hours. We inspect it and refund to the original payment method. No queue, no courier receipt to keep.'],
  ['Who do I pay?', 'Afrikart, always. We never ask you to pay a seller directly. That is what makes the refund a click instead of an argument.'],
  ['Is my money safe?', 'We hold the payment until delivery is confirmed. If an order does not arrive, you are refunded in full and we recover from the seller.'],
  ['Do you sell outside Botswana?', 'Not yet. We deliver anywhere in Botswana and we source from suppliers inside the Southern African Customs Union, which is why our prices hold up against imports.'],
  ['How do I sell on Afrikart?', 'Apply through Seller Central. You need company registration, a tax number and a bank account. Every seller is verified before a single listing goes live.'],
]

export default function Help() {
  return (
    <div className="container" style={{ maxWidth: 980 }}>
      <div className="panel mt24">
        <div className="panel-body" style={{ padding: 28 }}>
          <div className="eyebrow" style={{ color: 'var(--saffron-2)' }}>Help centre</div>
          <h1 style={{ fontSize: 28, marginBottom: 8 }}>Delivery, returns and payments</h1>
          <p className="muted" style={{ fontSize: 14, maxWidth: '62ch' }}>
            The four things that decide whether online shopping works in this market: does it arrive,
            when does it arrive, can I send it back, and who is holding my money. Here is our answer to each.
          </p>
          <div className="row wrap mt16" style={{ gap: 10 }}>
            <Link to="/account#orders" className="btn btn-dark">Track an order</Link>
            <Link to="/seller" className="btn btn-ghost">Sell on Afrikart</Link>
          </div>
        </div>
      </div>

      <div className="promises" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {[
          ['truck', 'Next day', 'Gaborone, Tlokweng, Mogoditshane'],
          ['return', '7-day returns', 'Collected from your door'],
          ['shield', 'Buyer protection', 'We hold the money until delivery'],
        ].map(([i, t, s]) => (
          <div className="promise" key={t}>
            <span className="promise-ico"><Icon name={i} size={17} /></span>
            <div><b>{t}</b><span>{s}</span></div>
          </div>
        ))}
      </div>

      <div className="panel mt16">
        <div className="panel-head"><h3>Common questions</h3></div>
        <div className="panel-body">
          {FAQ.map(([q, a]) => (
            <div key={q} style={{ padding: '14px 0', borderBottom: '1px solid var(--line-2)' }}>
              <b style={{ fontSize: 13.5 }}>{q}</b>
              <p className="muted" style={{ fontSize: 13, marginTop: 5, lineHeight: 1.65 }}>{a}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="panel mt16">
        <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <b style={{ fontSize: 14 }}>Your rights as a consumer</b>
            <p className="muted" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.65 }}>
              Afrikart trades under the Consumer Protection Act and the Electronic Communications and
              Transactions Act. You have the right to clear pricing, accurate descriptions, a working
              returns process and a refund where goods are not as described.
            </p>
          </div>
          <div>
            <b style={{ fontSize: 14 }}>Your data</b>
            <p className="muted" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.65 }}>
              We process personal data under the Data Protection Act, 2024. We do not sell it. Sellers only
              see the name, address and phone number needed to ship a specific order — never your history
              or your payment details.
            </p>
          </div>
        </div>
      </div>

      <div className="panel mt16" style={{ marginBottom: 40 }}>
        <div className="panel-body" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <Icon name="info" size={22} style={{ color: 'var(--navy-3)' }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <b style={{ fontSize: 13.5 }}>Still stuck? Talk to a person.</b>
            <div className="tiny muted">WhatsApp +267 7X XXX XXX · support@afrikart.co.bw · Mon–Sat 08:00–18:00</div>
          </div>
          <button className="btn btn-primary">Open WhatsApp support</button>
        </div>
      </div>
    </div>
  )
}
