import assert from "node:assert/strict";
import { looksLikeOfx, ofxCents, ofxDate, parseOfx } from "./ofx";

const SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>USD
<BANKACCTFROM><BANKID>123<ACCTID>00098765<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261001<DTEND>20261005
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261002120000[-10:HST]<TRNAMT>-84.17<FITID>1<NAME>FOODLAND &amp; CO<MEMO>POS PURCHASE</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261003<TRNAMT>2400.00<FITID>2<NAME>EMPLOYER PAYROLL</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261004<TRNAMT>-5<FITID>3<MEMO>ATM FEE</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>bad<TRNAMT>-1.00<FITID>4<NAME>X</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>4950.00<DTASOF>20261005</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

assert.ok(looksLikeOfx(SGML));
assert.ok(!looksLikeOfx("Date,Payee,Amount\n10/01/2026,Foodland,-5"));
const r = parseOfx(SGML);
assert.equal(r.rows.length, 3);
assert.equal(r.errors.length, 1);
assert.deepEqual(r.rows[0], { line: 1, date: "2026-10-02", payee: "FOODLAND & CO", memo: "POS PURCHASE", amountCents: -8417 });
assert.equal(r.rows[1].amountCents, 240000);
assert.equal(r.rows[2].payee, "ATM FEE"); assert.equal(r.rows[2].amountCents, -500);
assert.deepEqual(r.ledger, { cents: 495000, date: "2026-10-05" });
assert.equal(r.acctTail, "8765"); assert.equal(r.kind, "bank");

// XML flavour, credit card, negative balance (owed)
const XML = `<?xml version="1.0"?><OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CCACCTFROM><ACCTID>3782</ACCTID></CCACCTFROM><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261001</DTPOSTED><TRNAMT>-12.34</TRNAMT><FITID>a</FITID><NAME>ZOOM.US</NAME></STMTTRN></BANKTRANLIST>
<LEDGERBAL><BALAMT>-2300.55</BALAMT><DTASOF>20261005</DTASOF></LEDGERBAL></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;
const x = parseOfx(XML);
assert.equal(x.rows[0].amountCents, -1234); assert.equal(x.ledger!.cents, -230055); assert.equal(x.kind, "card");

assert.equal(ofxCents("-0.05"), -5); assert.equal(ofxCents("1,234.50"), 123450); assert.equal(ofxCents("12,5"), 1250); assert.equal(ofxCents("abc"), null);
assert.equal(ofxDate("20260230"), null); assert.equal(ofxDate("20260228"), "2026-02-28");
console.log("ofx tests passed");
