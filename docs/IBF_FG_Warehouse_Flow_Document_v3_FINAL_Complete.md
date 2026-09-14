# ISCON BALAJI FOODS — FINISHED GOODS WAREHOUSE MODULE
## Complete Operational Flow Document — LEVEL 3 (FINAL)
### (For Architect Agent & Claude Code)

**Document Purpose:** This is the complete operational flow of how the Finished Goods (FG) Warehouse at Iscon Balaji Foods, Limbasi must function. Not a module design — a flow document. Architect Agent uses this for system design. Claude Code uses this to build without confusion.

**Prepared by:** Alpesh Parmar
**Scope:** FG Warehouse, Limbasi Plant (primary) + inter-warehouse transfers to 3PL locations
**Status:** Flow Document v3.0 FINAL — all SAP data incorporated, all flows detailed
**Date:** 12 September 2026

---

## PART 0: CORRECTION LOG (V1 → V2 → V3)

| # | V1 (Assumed) | V2 (Corrected) | V3 (Final — SAP Master Added) |
|---|---|---|---|
|---|---|---|
| 1 | One pallet = one material + one batch | One pallet = one material + **may have 2+ batches**. Pallet has a **weight limit (kg)** — e.g., 1000 kg max. System blocks adding material beyond limit. |
| 2 | Bulk area is inside warehouse | Bulk area is in **Packing Department**. Warehouse gives bulk-packed FG to packing, packing repacks into proper cartons, returns to warehouse. |
| 3 | FGxxxxx is the material code | **LFG** = Limbasi Finished Goods, **SFG** = Sabarkantha (Himmatnagar) Finished Goods. "FG" is legacy term still used in WhatsApp. System uses LFG/SFG codes. |
| 4 | Bulk = unpacked/loose FG | Bulk = **packed in bulk cartons** (not branded cartons). Two types: (a) Over-production excess, (b) Defective fries. Both are packed, just in different cartons. Online-add possible later. |
| 5 | SAP storage location codes assumed | Removed — waiting for Alpesh | **COMPLETE SAP MASTER RECEIVED — 110 warehouses** (see Appendix D) |
| 6 | Receiving flow assumed scanning | No scanning — digitize paper Receiving Sheet | No change |
| 7 | Implied integration | Independent module | No change |


---

## PART 1: CONTEXT & ACTORS

### 1.1 Company Context
- Iscon Balaji Foods Pvt. Ltd. — Asia's largest potato flakes manufacturer
- Products: French Fries (6mm, 9mm, 11mm, Straight Cut, Crinkle Cut, Shoestring, Skin On), Aloo Tikki, Veggie Sliders, Potato Popcorn, Cheese Corn Chalks/Nuggets, Hash Browns, Wedges, Speciality products
- Frozen products stored at -18°C in cold storage rooms
- 20+ countries export, domestic sales, 6 plants
- SAP is the ERP — but warehouse operations run via WhatsApp and manual coordination
- Existing modules (all independent): Production Module, Quality Module, Maintenance Module, Store Register v13 (RM/PM Store)
- **This new module is for FG Warehouse only** — separate from Store Register

### 1.2 Actors & Teams

| Team | Role in FG Warehouse |
|------|---------------------|
| **IBF Warehouse Team** (warehouse incharge, operators, executives) | Receives FG from packing, stores in racks/pallets, loads vehicles, dispatches, transfers to 3PL warehouses, maintains stock accuracy |
| **Packing IBF Limbasi** (packing team, packing operators) | Packs FG into branded cartons, places on pallets, creates pallet slips, sends to warehouse. Also handles bulk repacking (bulk cartons → branded cartons) |
| **FF Production IBF** (French Fries production line) | Produces FG, generates hold requests (high temp, defects), needs to release FG after production review |
| **Speciality Line IBF** | Same as FF Production but for speciality SKUs (sliders, nuggets, tikkis, etc.) |
| **IBF QC LAB** (Quality Control — Kamlesh and team) | Inspects FG, places QC HOLD, releases materials, approves export containers, inspects bulk |
| **Maintenance Department** | Resolves warehouse equipment issues (forklifts, doors, racking, electrical, refrigeration) |
| **Logistics/Dispatch team** (Praveen, Jaimin, Rujul) | Coordinates vehicles, container bookings, dispatch schedules, 3PL transfers |
| **SAP Support** (sap.support@isconbalajifoods.com) | SAP issues, SAP release of materials |
| **Sales/Party** (customers) | Places orders, receives materials |
| **Security/Gate** | Gate pass verification, vehicle entry/exit |

### 1.3 Physical Warehouse Structure (verified from DSR data)

**Cold Storage Rooms:**
- **CR1** — Cold Room 1, Blocks 01 through 36, plus CR1-FLOOR (floor staging)
- **CR2** — Cold Room 2, Blocks 01 through 36, plus CR2-FLOOR (floor staging)
- Each block has positions: A, B, C, D, E (5 positions per block, some may differ)
- Each position has floors/levels: 1, 2, 3, 4 (4-floor standard; some blocks like I may have 5 floors)
- Location code format: `CR + Room + Block + Position + Floor` (e.g., CR1-01-A-4 means CR1, Block 01, Position A, Floor 4)
- Each floor position holds one pallet

**3PL / External Warehouses (verified from SAP master + DSR data):**

SAP defines **22+ 3PL cold storage locations** for Limbasi FG alone, and **15+ for Sabarkantha FG**. Key 3PLs:

| DSR Name | SAP Code(s) | 3PL Company |
|----------|-------------|-------------|
| COLDMAN | LMFGA-CM, LMFG-CMU | Cold Man Cold Storage |
| COLDRUSH | LMFGA-CR, LMFGACRH | Cold Rush Logistics |
| RK | LMFGA-RK, LMFGARKU | Radhakrishan Cold Store |
| MZ | LMFGA-MZ | MZ Cold Storage |
| AMAR | LMFGAMAR | Amar Cold Store |
| INDICOLD | LMFGVIND | Indicold (virtual) |
| WHOLESOME | LMFGAWS | Wholesome |
| FARMTON | LMFMT | Farmton Foods |
| FROSTINE | SKFGA-FR, SKFGAFR2 | Frostine Cold Storage |
| NIKHAR | SKFGAFNK | Nikhar Cold Storage |
| KRAV KRAFT | SKFGAKKF | Kravekraft Foods |
| SHREE MARUTI | SKFGASML | Shree Maruti Logistics |
| JAI JINENDRA | SKFGJJAF, SKJJH | Jai Jinendra Agro Foods |
| BRATTLE | SK1FGABT | Brattle Warehouse |

Complete list of all 110 SAP codes in Appendix D.

**Zones within warehouse:**
- Receiving dock (where packing team delivers pallets) — this is where the Receiving Sheet is filled
- Storage racks (CR1, CR2 with block/position/floor system)
- Dispatch dock (vehicle loading)
- Export container staging area
- Floor staging (CR1-FLOOR, CR2-FLOOR — temporary placement when racks are full)

**Note:** Bulk area is NOT in the warehouse — it is in the Packing Department. Warehouse gives bulk-cartoned FG to packing team; packing team repacks into proper branded cartons and returns to warehouse.

### 1.4 Material Types (corrected)

| Code Prefix | Meaning | Example |
|-------------|---------|---------|
| **LFG** | Limbasi Finished Goods (produced at Limbasi plant) | LFG00049, LFG00938 |
| **SFG** / **SKFG** | Sabarkantha Finished Goods (produced at Himmatnagar plant) | Confirmed in SAP master |
| FG | Legacy term — still used in WhatsApp but system uses LFG/SFG | — |

**Material Master Structure (from FG CODE sheet in DSR):**
- CODE (e.g., LFG00938)
- DESCRIPTION (e.g., "Hungritos Shoestring French Fries 1.0 kg")
- UOM (kg per carton — e.g., 12, 12.5, 10, 10.5, 15)
- CATEGORY (e.g., 9MM, 6MM, Straight Cut, Skin On 11mm, Crinkle cut, Bulk, RM-DICE)

**Material Categories observed:**
- 9MM, 6MM, 7MM, 11MM, 14MM — French Fries by cut size
- Straight Cut, Crinkle Cut, Shoestring, Skin On, Everlast
- Bulk — bulk-packed products (e.g., "French Fries 7mm (Bulk)", "Potato Popcorn (Bulk)")
- Slider — Veggie Slider, Aloo Tikki Slider, Cheese Corn Chalks/Nuggets
- Wedges, Hash Browns
- Potato Dice, Potato Slice — RM-grade products stored in FG warehouse

### 1.5 Pallet Rules (CORRECTED — critical)

**RULE 1:** One pallet = one material code (NO mixing different materials on same pallet)

**RULE 2:** One pallet MAY have 2 or more batches of the SAME material
- Example: Pallet with LFG00938 batch L26I010938 (960 cartons) + LFG00938 batch L26H130938 (640 cartons) — both same material, different batches, on same pallet
- This is allowed because same material = same physical product, just different production dates

**RULE 3:** Pallet has a weight/capacity limit (in kg) defined per material
- Example: Material LFG00938 has pallet limit = 1000 kg
- If someone tries to add more material to a pallet that already has 1000 kg, system gives error: "Pallet booked — 1000 kg already loaded"
- Weight limit is configurable per material in material master
- This prevents overloading and makes pallet tracking accurate

**RULE 4:** Pallet types observed:
- Plastic Pallet (noted as "PLASTIC PALLET" in remarks)
- Wooden Pallet (noted as "WOODEN PALLET" in remarks)
- Pallet type is a selectable attribute, not a constraint on what can be stored

### 1.6 Material Status Taxonomy (verified from DSR REMARK values)

The actual remark values found in the DSR reveal the real status vocabulary used by warehouse team:

| Status | DSR Remark Examples | SAP Code (Limbasi) | SAP Code (Sabarkantha) | Can Dispatch? | Can Transfer? |
|--------|-------------------|--------------------|-----------------------|---------------|---------------|
| **OK / AVAILABLE** | "OK", "OK BOX", "OK FOR 58 BOX", "OK-50", "OK-17" | LMFGA | SKFGA | YES | YES |
| **HOLD** | "HOLD", "hOLD", "hold", "HOLD TEMP", "HOLD TRAIL", "HOLD LOAD", "HOLD MATERIAL", "HOLD BULK 12KG", "HOLD 10 KG CHANGE", "43 BOX HOLD", "ABS-T-10 HOLD" | LMFGH | SKFGH | NO | YES (with hold tag) |
| **BULK** | "BULK", "BULK (HOLD)" | LMFGBULK | SKFGBULK | NO (needs repacking) | YES (with bulk tag) |
| **QC HOLD** | "QC HOLD", "QC SAMPLE", "QC SAMPLE HOLD", "HOLD QC SAMPLE", "Quality Sample" | LMFGQ | SKFGQ | NO | YES (with hold tag) |
| **HOLD TRANSFER** | "HOLD TRANSFER", "HOLD MATERIAL TRANSFER TO COLDMAN" | LMFGIN→3PL | SKGJFGIN→3PL | NO | YES (hold tag) |
| **ISSUE FOR PRODUCTION** | "ISSUE FOR PRODUCTION", "ISSUE FOR REPACKING", "ISSUE" | (consumed) | (consumed) | NO (consumed) | N/A |
| **OTHER BOX** | "OTHER BOX", "10 KG OTHER BOX", "OTHER BOX 7.5 KG" | (within LMFGA) | (within SKFGA) | Conditional | Conditional |
| **DAMAGED** | "BULGING", "INAR DEMAGE", "6 damaged", "1 pkt short found in boxes" | LMGOA | SKGOA | NO | Conditional |
| **TRIAL / TRAIL** | "TRAIL", "TRIAL", "TRAIL HOLD", "TRAIL HOLD MATERIAL", "Quality Sample - Trial" | (within LMFGQ/H) | (within SKFGQ/H) | NO | Conditional |
| **ONLINE ADD** | "ONLINE ADD 12-07-2026/A" | (within LMFGA) | (within SKFGA) | YES (after QC) | YES |

**Note on Remark chaos:** Currently the REMARK column in DSR is free-text and inconsistent — "HOLD", "hOLD", "hold", "HOLD TEMP", "HOLD MATERIAL" all mean similar things but are typed differently. The module MUST standardize these into a fixed dropdown (no free text for status).

**KEY RULE:** Hold material ka koi physical cycle nahi hai. Material same jagah rehta hai. Sirf STATUS change hota hai. The problem is tracking — nobody remembers which material is on hold, why, since when. The dashboard must solve this.

### 1.7 SAP Storage Location Master — COMPLETE (received from Alpesh)

**SAP Code Naming Convention:**

```
[Plant][MaterialType][Status][Suffix]

Plant:     L = Limbasi | SK = Sabarkantha | PT = Patan
Material:  FG = Finished Goods | RM = Raw Material | PM = Packing Material |
           IA = Ingredients & Additives | SF = Shop Floor | RT = Returnable |
           SW = Scrap & Waste | GOA = Grade Out | NPD = New Product Dev |
           SS = Store & Spares | TPW = Third Party Material | TR = Trading |
           MT = (Farmton) | FMT = Farmton Foods
Status:    Q = Under QC | A = Approved | H = Hold | D = Dispatch |
           IN = In-Transit | BULK = Bulk | CS = Customer Sample |
           SMPL = Sample | VIND = Virtual Indicold
Suffix:    -CM = Cold Man | -CR = Cold Rush | -RK = Radhakrishan |
           -MZ = MZ Cold | -MAR = Amar | -FR = Frostine |
           -HO = Head Office | -WS = Wholesome | etc.
```

**FG-Relevant SAP Codes (Limbasi — 20 codes):**

| SAP Code | Full SAP Name | Module Mapping |
|----------|---------------|----------------|
| LMFGQ | Limbasi FG Under QC Warehouse - Frozen | Status: QC HOLD (new inward) |
| LMFGA | Limbasi FG Approved Warehouse - Frozen | Status: OK/AVAILABLE |
| LMFGH | Limbasi FG Hold Warehouse | Status: HOLD |
| LMFGD | Limbasi FG Dispatch Warehouse | Status: DISPATCHED |
| LMFGIN | Limbasi FG In-Transit Warehouse - Frozen | Status: IN TRANSIT |
| LMFGBULK | Limbasi FG Bulk Warehouse | Status: BULK |
| LMFGCS | Limbasi FG Customer Sample Warehouse | Status: CUSTOMER SAMPLE |
| LMFGSMPL | Limbasi FG Sample Warehouse - Frozen | Status: SAMPLE |
| LMFGVIND | Limbasi FG Virtual INDICOLD Approved - Frozen | 3PL: Indicold (virtual) |
| LMFGA-CM | Cold Man Approved Warehouse - Frozen | 3PL: Cold Man |
| LMFG-CMU | Cold Man (Under QC variant) | 3PL: Cold Man (QC pending) |
| LMFGA-CR | Cold Rush Approved Warehouse - Frozen | 3PL: Cold Rush |
| LMFGACRH | Cold Rush Approved - Coldrush variant | 3PL: Cold Rush (alt code) |
| LMFGA-RK | Radhakrishan Cold Store | 3PL: Radhakrishan |
| LMFGARKU | Radha Krishna Cold Storage - GJ | 3PL: Radha Krishna (GJ) |
| LMFGA-MZ | MZ Cold Storage | 3PL: MZ |
| LMFGAMAR | Amar Cold Store Approved - Frozen | 3PL: Amar |
| LMFGAWS | Wholesome FG Approved Warehouse | 3PL: Wholesome |
| LMFGASK | Sabarkantha Cold Storage (Limbasi FG at SK) | Cross-plant: Limbasi FG at SK |
| LMFGA-HO | IBF Corporate Head Office | FG at Head Office |

**FG-Relevant SAP Codes (Sabarkantha — 24 codes):**

| SAP Code | Full SAP Name | Module Mapping |
|----------|---------------|----------------|
| SKFGQ | SK FG Under QC Warehouse - Frozen | Status: QC HOLD |
| SKFGA | SK FG Approved Warehouse - Frozen | Status: OK/AVAILABLE |
| SKFGH | SK FG Hold Warehouse | Status: HOLD |
| SKFGBULK | Himmatnagar FG Bulk Warehouse | Status: BULK |
| SKFGCS | Himmatnagar FG Customer Sample Warehouse | Status: CUSTOMER SAMPLE |
| SKFGSMPL | Himmatnagar FG Sample Warehouse | Status: SAMPLE |
| SKGJFGIN | SK Goods In-Transit Warehouse - Frozen | Status: IN TRANSIT |
| SKGOA | SK Grade Out Material Warehouse | Status: REJECTED |
| SKFGA-FR | Frostine Cold Storage | 3PL: Frostine |
| SKFGAFR2 | Frostine Elite Cold Storage-2 | 3PL: Frostine Elite |
| SKFGACR | Coldrush Logistics Mehsana | 3PL: Cold Rush Mehsana |
| SKFGACR2 | Coldrush Logistics Mehsana-2 | 3PL: Cold Rush Mehsana-2 |
| SKFGAFNK | Nikhar Cold Storage | 3PL: Nikhar |
| SKFGAKKF | Kravekraft Foods WH | 3PL: Kravekraft |
| SKFGASML | Shree Maruti Integrated Logistics | 3PL: Shree Maruti |
| SKFGAVCM | Virtual Cold Man Approved - Frozen | 3PL: Cold Man (virtual) |
| SKFGJJAF | Jai Jinendra Agro Foods LLP | 3PL: Jai Jinendra |
| SKJJH | Jai Jinendra Agro Foods - Hold WH | 3PL: Jai Jinendra (Hold) |
| SK1FGCR | Cold Rush Plant Warehouse | 3PL: Cold Rush Plant |
| SK1FGCRM | Cold Rush Mehsana Warehouse | 3PL: Cold Rush Mehsana |
| SK1FGCM | Cold Man Approved - Frozen | 3PL: Cold Man |
| SK1FGAM | Amar Cold Store Approved - Frozen | 3PL: Amar |
| SK1FGARK | Radha Krishna Cold Storage | 3PL: Radha Krishna |
| SK1FGABT | Brattle Warehouse | 3PL: Brattle |
| SKSALES | SK Sales | Sales/dispatch |

**Status-to-SAP Code Mapping (for module design):**

```
MODULE STATUS        SAP CODE (Limbasi)    SAP CODE (Sabarkantha)
─────────────────    ──────────────────    ──────────────────────
QC HOLD (new)        LMFGQ                 SKFGQ
OK / AVAILABLE       LMFGA                 SKFGA
HOLD                 LMFGH                 SKFGH
BULK                 LMFGBULK              SKFGBULK
DISPATCHED           LMFGD                 (via SKSALES)
IN TRANSIT           LMFGIN                SKGJFGIN
CUSTOMER SAMPLE      LMFGCS                SKFGCS
SAMPLE               LMFGSMPL              SKFGSMPL
REJECTED / GRADE OUT LMGOA                 SKGOA
SCRAP                LMSW                  —

3PL TRANSFER →       LMFGA-XX (suffix)     SKFGAXX / SK1FGXX
```

**Critical Design Insight:**
- SAP storage location (LMFGA etc.) is NOT the same as physical location (CR1-01-A-4)
- SAP storage location = a STATUS + WHOLESALER identifier
- Physical location (rack/block/floor) is managed by this module only
- One SAP code (e.g., LMFGA) maps to many physical locations across CR1 and CR2
- The module must maintain BOTH: SAP code (for SAP sync) + physical location (for warehouse ops)
- Complete list of all 110 SAP codes (including RM/PM/IA/Store/Spares) is in Appendix D

---

## PART 2: CORE OPERATIONAL FLOWS

### FLOW 1: FG RECEIVING FROM PACKING TEAM (Inward) — THE RECEIVING SHEET

**Trigger:** Packing team finishes packing a production batch and delivers pallets to warehouse receiving dock.

**Current Process (as-is — paper form):**
The warehouse team fills a paper "WAREHOUSE RECEIVING SHEET" with the following structure:

```
Header:
  DATE: 12/09/26
  SHIFT: A (or B or C)
  FS CODE: (blank — production code)
  LINE: FF (or Speciality)
  Product Name: AL Zawid premium - 10 KG
  BATCH: 2261121052

Table (35 rows):
  SR NO | RECEIVING TIME | PALLET NO | QTY | TOTAL QTY | REMARKS
  1     | 09:40          | 30673     | 60  | 60        |
  2     | 09:50          | 30675     | 60  | 120       |
  3     | 10:10          | 30676     | 60  | 180       |
  4     | 10:10          | 30698     | 60  | 240       |
  ...

Footer (signatures):
  SUP. SIGN (Supervisor)
  P. OPERATOR (Packing Operator)
  TOTAL BOXES
  W. EXECUTIVE (Warehouse Executive)
  OPERATOR SIGN
  AUTHORISED SIGN
```

**Problems with current paper form:**
1. Disputes: "You gave me damaged cartons" / "You gave me fewer than I recorded" — no proof
2. Temperature not recorded — "Cartons were warm when received"
3. Paper gets lost, damaged, illegible
4. No real-time visibility — data entered in DSR Excel later (sometimes next day)
5. Manual signatures = accountability but no audit trail
6. If cartons are bulging, damaged, or short — noted in REMARKS but not tracked systematically

**Required Process (to-be) — Digital Receiving Sheet:**

The module must replicate this exact paper form as a digital form — same fields, same flow, but smarter. NO scanning for now (scanners will come later, then scanning function added).

```
STEP 1: WAREHOUSE EXECUTIVE OPENS NEW RECEIVING SHEET
  Screen: "New FG Receiving Sheet"
  
  Header Fields (same as paper form):
  - DATE (auto = today, editable)
  - SHIFT (dropdown: A / B / C)
  - LINE (dropdown: FF / Speciality)
  - PRODUCT NAME (auto-filled from material code selection, OR search/select)
  - MATERIAL CODE (dropdown/search from material master — LFG/SFG codes)
  - BATCH NO (manual entry — validate format: L + month + day + sequence)
  
  System auto-generates: RECEIVING SHEET NO (e.g., RS-2026-0912-001)

STEP 2: PALLET-BY-PALLET ENTRY (the table)
  For each pallet delivered:
  - PALLET NO (manual entry — the pre-printed pallet slip number, e.g., 30673)
  - QTY (manual entry — cartons count, e.g., 60)
  - RECEIVING TIME (auto-timestamp when entry is made, OR manual entry)
  - TOTAL QTY (auto-calculated running total)
  - REMARKS (dropdown + free text — see status taxonomy)
  
  "Add Pallet" button → adds next row
  Up to 35 pallets per sheet (matching current paper form capacity)
  
  DISPUTE-PREVENTION FIELDS (new — not on paper form):
  - CARTON CONDITION (dropdown for each pallet or per sheet):
    * OK (good condition)
    * BULGING (carton sides bulging — quality concern)
    * DAMAGED (carton torn/crushed)
    * WET (moisture on carton)
    * OTHER (free text)
  - TEMPERATURE READING (°C at receiving — optional but recommended)
    * If temperature > -15°C → amber warning: "Temperature above threshold"
  - SHORT QUANTITY (if received qty < expected qty — auto-flag)
  
  These fields END the disputes:
  * "You gave me damaged cartons" → Record says: carton condition = DAMAGED, 
    noted at 09:40 by warehouse executive, photograph optional
  * "Temperature was not right" → Record says: -12°C at receiving, 
    flagged amber
  * "You gave me fewer cartons" → Record shows exactly what was received 
    vs what packing says they sent

STEP 3: ACKNOWLEDGMENT (replaces physical signatures)
  After all pallets entered:
  - PACKING SIDE: Packing Supervisor / Packing Operator confirms 
    (digital signature — login + confirm button)
  - WAREHOUSE SIDE: Warehouse Executive confirms receipt 
    (digital signature — login + confirm button)
  - Both confirmations timestamped
  
  If packing side is not available to confirm immediately:
  - Sheet saved as "PENDING PACKING CONFIRMATION"
  - Packing team sees it in their queue
  - Once confirmed → sheet locked

STEP 4: AUTO-STATUS ASSIGNMENT
  - All received FG pallets auto-set to status: QC HOLD 
    (mirrors SAP LMFGQ — new FG awaiting inspection)
  - Bulk material auto-set to status: BULK
  - System sends notification to QC LAB dashboard: 
    "New FG received — [Material] [Batch] [Qty] pallets — inspection required"
  - SLA timer starts (configurable — e.g., inspection within X hours)

STEP 5: PUTAWAY (same as Flow 2)
  - Each pallet gets assigned a storage location
```

**Rules & Constraints:**
- NO scanning for now — all manual entry (scanners will be added later)
- Form must be simple enough to fill on a tablet/phone in -18°C with gloves — 
  large buttons, dropdowns, minimal typing
- Receiving Sheet is a LEGAL DOCUMENT — once both sides confirm, it is locked
- Discrepancy (damaged/bulging/short) must be recorded AT receiving time, 
  not later — this is what ends disputes
- Total qty auto-calculated — no manual addition errors
- Batch number must match production records
- One Receiving Sheet = one material + one batch + one shift + one line 
  (same as current paper form)
- If multiple batches on same pallet → pallet entry allows selecting 
  multiple batches (but same material only)

**Data captured per Receiving Sheet:**
- Receiving Sheet No, Date, Shift, Line, Material Code, Material Description, Batch No
- Per pallet: Pallet No, Qty, Receiving Time, Carton Condition, Temperature 
  (if recorded), Remarks
- Total Qty (auto), Total Boxes
- Packing Supervisor (confirmed by), Packing Operator (confirmed by)
- Warehouse Executive (received by), Warehouse Operator
- Status: QC HOLD (default) / BULK
- Linked to: QC inspection queue, Putaway locations

---

### FLOW 2: PUTAWAY & LOCATION MANAGEMENT (Rack/Pallet-wise)

**Trigger:** After receiving FG, warehouse needs to store it in cold storage.

**Flow:**

```
STEP 1: SYSTEM SUGGESTS LOCATION
  Based on:
  - FIFO accessibility (older batches of same material should be reachable)
  - Cold room capacity (which CR has empty positions)
  - Block/floor availability
  - Pallet weight (heavier pallets on lower floors)
  
  System checks: which locations are empty for that pallet type
  Shows: rack map with empty positions highlighted

STEP 2: WAREHOUSE OPERATOR CONFIRMS OR OVERRIDES
  - Operator selects pallet ID → selects location (CR + Room + Block + Position + Floor)
  - System validates:
    * Location is empty
    * Location accepts that pallet type
    * Pallet weight within location capacity
  - If location occupied → error: "Location CR1-01-A-4 is occupied by 
    Pallet 30080 (LFG00613)"
  
STEP 3: LOCATION OCCUPIED
  - Rack map updates (color-coded):
    * Green = empty
    * Red = full (occupied)
    * Blue = partial (pallet has space for more — same material)
    * Yellow = mix (different batches — allowed for same material)
    * Orange = HOLD (material on hold at this location)
    * Purple = search result (highlighted)
    * Grey = blocked/unavailable
  - Pallet ID ↔ Location linked
  - Timestamp recorded

STEP 4: MOVES BETWEEN LOCATIONS (if needed later)
  - "Move" operation: select pallet → select new location → confirm
  - Reason for move recorded (rearrangement, hold consolidation, space 
    management, etc.)
  - History of all moves maintained (audit trail)
  - "CR1-FLOOR" and "CR2-FLOOR" are valid temporary locations (floor 
    staging when racks are full)
```

**Rules:**
- Location hierarchy: Warehouse → Cold Room (CR1/CR2) → Block (01-36) → 
  Position (A-E) → Floor (1-4 or 5)
- Each floor position holds one pallet
- Multiple pallets of same material can be in same block (different 
  positions/floors) — this is normal and expected
- Same material + different batches can share a pallet (per corrected Rule 2)
- Location history per pallet must be traceable
- Physical verification (cycle count) — match physical vs system stock

---

### FLOW 3: HOLD MATERIAL MANAGEMENT (Identification & Tracking)

**Trigger:** QC LAB places a hold, or production flags an issue.

**Current pain point:** "Hold ka koi cycle nahi, Kisi ko yaad hi nahi rehta" — nobody remembers which materials are on hold, why, since when. The DSR REMARK column shows the chaos: "HOLD", "hOLD", "hold", "HOLD TEMP", "HOLD TRAIL", "HOLD LOAD", "HOLD MATERIAL", "43 BOX HOLD" — all meaning similar things but typed differently.

**Flow:**

```
STEP 1: HOLD ENTRY
  Who can put on HOLD: QC LAB, Production (with QC confirmation)
  
  - Select material/batch/pallet(s)
  - Select hold reason from FIXED DROPDOWN (no free text):
    * High Temperature (product temp above -18°C)
    * Metal piece found (repass needed)
    * Thread contamination
    * Enzyme test positive
    * Uneven coating / Belt mark
    * High defects / Major defects
    * Dull appearance and color difference
    * Short length
    * Black particles
    * White patches on product surface
    * Wrong batch code printed
    * Batter bubbles
    * Product carton not available (pack in other box)
    * Low retention time
    * Bad smell in product
    * Misshapes
    * Over-production (bulk — needs repacking)
    * Defective fries (bulk — needs repacking)
    * Trial / Sample
    * Other (free text — requires supervisor approval)
  
  - Record: who put on hold, date, time, department
  - Status changes: OK/RELEASED → HOLD (or QC HOLD stays as HOLD)
  - Hold ID auto-generated (e.g., HOLD-2026-0912-001)

STEP 2: HOLD DASHBOARD (visible to Warehouse Incharge, QC, Production)
  - List of ALL currently held materials
  - For each: 
    * Hold ID
    * Material code, description
    * Batch number
    * Quantity (cartons + kg)
    * Pallet IDs
    * Location(s) — where physically stored
    * Hold reason (from dropdown)
    * Hold since (date/time)
    * Aging (days on hold) — auto-calculated
    * Who placed hold (name, department)
    * Aging highlights: > 3 days = amber, > 7 days = red 
      (thresholds configurable)
  - Group by: reason, material, age, department
  - Export/report capability

STEP 3: HOLD FOLLOW-UP (Quality Team Interaction)
  - System sends automatic reminders to QC LAB for held materials:
    * Daily digest: "You have X materials on hold — oldest since [date]"
    * Aging alert: material crossed threshold → escalation to QC head
  - Warehouse Incharge dashboard shows same — can "nudge" QC via system 
    (one click: "Follow up requested" — QC team sees it)
  - QC LAB sees pending hold queue — must inspect and decide
  - NO WhatsApp follow-up needed — system tracks everything

STEP 4: HOLD RELEASE (by QC)
  - QC selects held material(s) → "Release" action
  - Can release: full batch, specific pallets, partial quantity
  - Record: who released, date, time, remarks
  - Status: HOLD → OK/AVAILABLE
  - Material now dispatchable

STEP 5: HOLD REJECT (by QC)
  - QC selects held material → "Reject" action
  - Status: HOLD → REJECTED
  - Decision needed: rework / disposal / return to production
  - Rejected material must be moved to rejection area or marked for disposal

STEP 6: INTERACTION WITH PRODUCTION (for Hold/Bulk)
  When material is on hold due to production issue (temp, defects):
  - System notifies production team: "Your batch [X] is on hold for [reason]"
  - Production must acknowledge and provide action plan
  - Production can mark "issue resolved — please re-inspect"
  - This notification goes to the production dashboard (Production Module 
    — independent but receives a notification via shared notification queue)

STEP 7: BULK MATERIAL HANDLING (CORRECTED)
  Bulk is NOT unpacked material. Bulk is FG packed in bulk cartons (not 
  branded cartons) for two reasons:
  
  (a) Over-production: Production made 2500 cartons, plan was 2000, 
      allowed 10% extra = 2200. Extra 300 packed in bulk cartons.
  (b) Defective fries: Quality fail — packed in bulk cartons (not branded) 
      to save branded carton cost.
  
  Bulk lifecycle:
  1. Bulk material enters warehouse → status: BULK
  2. Warehouse transfers bulk to Packing Department (not warehouse bulk area)
  3. Packing team repacks bulk cartons into proper branded cartons
  4. OR: Bulk material is "online-added" to a future packing line run 
     (mixed with fresh production)
  5. After repacking → new pallets created → goes through FG Receiving 
     Sheet flow again (new pallet IDs, new QC hold)
  
  System tracks:
  - Bulk material: where it is, how old, how much, reason (over-production 
    vs defective)
  - Packing team queue: bulk pending repacking, aging
  - When bulk goes to packing: transfer record
  - When repacked FG comes back: new receiving sheet linked to original 
    bulk record (traceability)
```

**Rules — CRITICAL:**
- **HOLD materials CANNOT be dispatched to party** (hard block in system — 
  loading sheet cannot include hold-status material)
- **HOLD materials CAN be transferred to another warehouse/3PL** (with hold 
  tag — receiving warehouse sees it as hold)
- Hold is STATUS-BASED, not location-based — material stays where it is 
  physically (no physical movement on hold)
- Every hold must have: reason (from dropdown), date, who placed it
- Hold aging must be visible at all times
- No hold can be released without QC authority (role-based)
- Status values must be STANDARDIZED (dropdown only, no free text) — 
  this fixes the DSR remark chaos

---

### FLOW 4: INTER-WAREHOUSE / 3PL TRANSFER (with Hold/Bulk Tags)

**Trigger:** Material needs to move from Limbasi warehouse to a 3PL cold storage (COLDMAN, COLDRUSH, RK, JJ COLD, KRAV KRAFT) or to another plant (Himmatnagar/Sabarkantha).

**Flow:**

```
STEP 1: TRANSFER REQUEST
  Who initiates: Warehouse Incharge, Logistics (Praveen/Jaimin), Planning
  - Select: material, batch, quantity, pallet IDs
  - Select destination warehouse (from warehouse master — includes all 3PLs)
  - Transfer type: 
    * NORMAL (released/OK materials)
    * HOLD TAG (hold materials being transferred — receiving site must 
      re-inspect and release)
    * BULK TAG (bulk materials being transferred for repacking elsewhere)
  - Reason for transfer recorded
  - Transfer Order Number auto-generated (e.g., TO-2026-0912-001)

STEP 2: PICK & STAGE
  - System shows which locations the pallets are in
  - Warehouse picks from locations (FIFO suggested — oldest OK batch first)
  - Staged at dispatch dock
  - Pallet IDs verified against transfer order

STEP 3: VEHICLE LOADING for transfer
  - Vehicle number, driver name, transporter recorded
  - Loading sheet generated (see FLOW 5 for format)
  - Pallet-wise loading confirmed
  - Temperature check (if cold chain vehicle — -18°C required)
  - For 3PL transfers: LR (Lorry Receipt) number may be needed

STEP 4: IN-TRANSIT
  - Transfer status: IN TRANSIT
  - Material still in system but marked "in transit to [warehouse]"
  - In-transit stock shown separately in dashboard

STEP 5: RECEIVING AT DESTINATION WAREHOUSE
  - Receiving warehouse team (or 3PL) receives pallets
  - Verifies against Transfer Order
  - Confirms: material, batch, quantity, pallet condition
  - If HOLD TAG: material enters receiving warehouse with status HOLD
    (receiving warehouse cannot dispatch until THEIR QC releases)
  - If BULK TAG: material enters with status BULK
  - Discrepancy (damage, shortage) → flag back to source warehouse
  - At 3PL: material enters 3PL inward register (like DSR-3PL INWARD sheet)

STEP 6: TRANSFER COMPLETION
  - Stock deducted from Limbasi, added to destination warehouse
  - Stock ledger updated: batch-wise, location-wise at new warehouse
  - Transfer document archived
  - SAP entry (if applicable — parallel, may be delayed)
```

**Rules:**
- Hold materials transfer with hold tag — receiving warehouse must re-inspect 
  and release before dispatch
- Bulk materials transfer with bulk tag — receiving warehouse must arrange 
  repacking
- Transfer must be traceable: who initiated, who loaded, who received
- Inter-warehouse stock must be visible separately (per warehouse, per location)
- In-transit stock is a separate bucket — not in Limbasi, not yet in destination
- Vehicle/temperature details must be recorded for cold chain integrity
- Pallet IDs must be traceable across warehouses (same pallet ID travels)

**3PL Inward fields (from DSR-3PL INWARD sheet):**
- Date, Shift, FG Code, Product, Pallet No, Batch No, Qty, Location, Remark
- SAP No, SAP Executive Name
- WMS In No, WMS Executive Name

---

### FLOW 5: VEHICLE LOADING & LOADING SHEET

**Trigger:** Dispatch order received (party order) or transfer order needs vehicle loading.

**Flow:**

```
STEP 1: DISPATCH ORDER / SALES ORDER INPUT
  - From: Sales/Party order (manual entry or from planning)
  - Contains: Party name, destination, material codes, quantities, 
    preferred dispatch date, export/domestic
  - System checks: available stock (OK/AVAILABLE status only)

STEP 2: PICK LIST GENERATION (FIFO-based)
  - System selects materials to pick:
    * FILTER 1: Status = OK/AVAILABLE only 
      (HOLD/BULK/REJECTED/QC HOLD blocked — hard system block)
    * FILTER 2: FIFO — oldest batch first (by production date)
    * FILTER 3: Location-aware (pick from accessible locations, minimize 
      moves)
  - Generates pick list: material, batch, quantity, pallet IDs, locations
  - Warehouse operator picks from locations
  - Each pick confirmed (manual entry — no scanning for now)

STEP 3: STAGING & LOADING SHEET CREATION
  Materials staged at dispatch dock.
  Loading Sheet generated with:
  
  Header:
  - Loading Sheet Number (auto, e.g., LS-2026-0912-001)
  - Date, Time
  - Vehicle Number, Driver Name, Transporter
  - Party Name, Destination
  - Export/Domestic indicator
  
  Material Details (table):
  - Material Code, Description
  - Batch Number
  - Quantity (cartons)
  - Weight (kg)
  - Pallet IDs
  
  Pallet-wise loading sequence
  - Which pallet loaded first, second, etc.
  
  Quality checks:
  - Seal Number (for export containers)
  - Bolt Number (for export containers — observed in CONTAINER DETAILS)
  - Container Number (for export)
  - Temperature requirement (-18°C) & actual temperature at loading
  
  Authorization:
  - Loaded By (warehouse operator name)
  - Verified By (warehouse executive)
  - QC Approval (for export containers — "Ok for loading" by QC)
  - Gate Pass Number (linked)
  
  Loading sheet print/digital copy for: driver, security, records, party

STEP 4: QC CONTAINER APPROVAL (for exports)
  - QC inspects container before loading: "Ok for loading" required
  - Container temperature check (-18°C)
  - If container rejected → different vehicle needed
  - QC approval recorded in system (who approved, when)
  - Container details recorded: Container No, Seal No, Bolt No

STEP 5: GATE PASS
  - Linked to loading sheet
  - Security verifies: vehicle number, driver, quantity, materials
  - Gate pass number, exit time recorded
  - Dispatch complete

STEP 6: POST-DISPATCH
  - Stock deducted from system
  - Stock ledger updated: batch-wise, location-wise
  - Dispatch register updated
  - SAP: material moves to dispatch location (parallel, may be delayed)
  - Invoice copy (if applicable) linked
```

**Rules — CRITICAL:**
- **Only OK/AVAILABLE materials can be loaded for party dispatch** 
  (hard system block)
- **HOLD materials physically CANNOT appear on a loading sheet for party 
  dispatch** — system will not allow selection
- FIFO strictly enforced: system will not allow newer batch dispatch while 
  older batch of same material is available (override possible with 
  logged reason)
- Every vehicle loading must have a loading sheet (no exceptions)
- Export containers need QC approval before loading
- Temperature at loading must be recorded (cold chain compliance)
- Pallet IDs must be confirmed during loading (manual entry for now)
- Gate pass must match loading sheet
- Container details (container no, seal no, bolt no) must be recorded 
  for export dispatches

---

### FLOW 6: RELEASED MATERIAL DISPATCH TO PARTY

Material lifecycle for dispatch:

```
NORMAL PATH:
  PRODUCTION → PACKING → RECEIVING SHEET (QC HOLD) → PUTAWAY → 
  QC RELEASE → OK/AVAILABLE → PICK (FIFO) → LOAD → GATE PASS → DISPATCHED

HOLD PATH:
  PRODUCTION → PACKING → RECEIVING SHEET (QC HOLD) → PUTAWAY → 
  QC FINDS ISSUE → HOLD → [QC RE-INSPECTION → RELEASE → OK] 
  OR [REJECT] → ...

BULK PATH (CORRECTED):
  PRODUCTION → OVER-PRODUCTION OR DEFECTIVE → PACKED IN BULK CARTONS → 
  RECEIVING SHEET (BULK STATUS) → PUTAWAY IN COLD STORAGE → 
  TRANSFER TO PACKING DEPARTMENT → PACKING REPACKS INTO BRANDED CARTONS → 
  NEW RECEIVING SHEET (new pallet IDs, QC HOLD) → 
  QC RELEASE → OK/AVAILABLE → PICK → LOAD → DISPATCH
  
  OR: BULK → ONLINE-ADD TO FUTURE PACKING LINE → MIXED WITH FRESH PRODUCTION → 
  NEW RECEIVING SHEET → QC HOLD → RELEASE → DISPATCH

INTER-WAREHOUSE TRANSFER PATH:
  LIMBASI WAREHOUSE → TRANSFER ORDER → VEHICLE LOADING → 
  IN-TRANSIT → 3PL/OTHER PLANT RECEIVES → STOCK AT 3PL → 
  (IF HOLD TAG: 3PL QC MUST RELEASE) → DISPATCH FROM 3PL
```

---

### FLOW 7: FIFO STOCK MAINTENANCE

**Rule:** First In, First Out — oldest production batch of a material must be dispatched first.

**Flow:**

```
FIFO LOGIC (system-enforced):
  1. When pick list is generated, system sorts by production date (oldest first)
     - Production date derived from batch number (e.g., L26I07 = 2026, 
       September(I=9th month), 07th day)
  2. System shows operator: "Pick batch [older batch] first — 
     [X days] old, [quantity] available at [locations]"
  3. If operator tries to pick newer batch while older exists:
     - System warning: "FIFO violation — batch [older] has [qty] available 
       at [locations]"
     - Override possible with reason:
       * Customer specific request
       * Older batch on hold
       * Older batch in different warehouse
       * Other (free text — requires supervisor approval)
     - Override logged: who, why, when
  4. FIFO aging report: materials by age — what's old, what needs priority
  5. Stock aging dashboard:
     * 0-30 days (green)
     * 31-60 days (blue)
     * 61-90 days (amber)
     * 90+ days (red — urgent dispatch or quality review)
     * Alert if material crossing shelf-life threshold
```

**Rules:**
- FIFO is DEFAULT — override requires reason and logging
- Hold materials do NOT block FIFO of other OK materials (system suggests 
  oldest OK batch)
- FIFO applies per material code, per warehouse
- Production date (from batch number) is the FIFO basis — not inward date
- Shelf-life awareness: if product has expiry, FEFO (First Expired First Out) 
  should be configurable

---

### FLOW 8: MULTI-WAREHOUSE STOCK (Batch-wise, FIFO-wise, Location-wise)

**Flow:**

```
STOCK VISIBILITY ACROSS WAREHOUSES:
  1. Dashboard: total stock per material, broken by warehouse
     Limbasi CR1: Material LFG00938 — Batch L26I010938: 960 cartons 
       (at CR1-01-A-1 through CR1-01-A-10)
     Limbasi CR2: Material LFG00938 — Batch L26H130938: 640 cartons 
       (at CR2-15-B-1 through CR2-15-B-7)
     Coldrush: Material LFG00938 — Batch L26I010938: 200 cartons 
       (at Coldrush location TBD)
     RK: Material LFG00938 — Batch L26H130938: 150 cartons

  2. Drill-down: any material → all batches → all locations → all warehouses
     With: status, age, hold reason (if held), quantity, pallet IDs

  3. Transfer history per batch:
     "Batch L26I010938: Produced at Limbasi → stored CR1-01 → 
      transferred to Coldrush on [date] via vehicle [number] → 
      received on [date]"
     Full traceability chain

  4. Consolidated stock report (like IN-OUT sheet in DSR):
     - Per material: IN (shift-wise A/B/C), total, kgs
     - HOLD stock quantity
     - AVAILABLE stock quantity
     - INDENT (requirement from sales/planning)
     - Location-wise: Limbasi, Coldman, Coldrush, RK, JJ COLD, Krav Kraft
     - Pending dispatch
     - Export/Domestic classification
```

**Rules:**
- Each warehouse maintains its own location hierarchy 
  (CR1/CR2 + Block/Position/Floor for Limbasi; different for 3PLs)
- Stock queries can be: per warehouse, cross-warehouse, per material, per 
  batch, per status, per shift
- In-transit stock shown separately
- Batch traceability must be preserved across warehouse transfers
- Warehouse master must be configurable (add new 3PL warehouses without 
  code changes)

---

### FLOW 9: MAINTENANCE ISSUE & FOLLOW-UP

**Trigger:** Any equipment/facility issue in warehouse.

**Flow:**

```
STEP 1: ISSUE REPORTING
  Who can raise: any warehouse team member
  - Select issue category:
    * Door/Door belt damage (cold room doors, dock doors)
    * Forklift/Pallet truck breakdown
    * Racking damage (bent rack, broken beam)
    * Electrical (no power, plug point, lighting, panel)
    * Refrigeration (temperature rising, coil icing, compressor)
    * PPE/Infrastructure (floor damage, safety)
    * Other
  - Location: which CR/block/area
  - Description (text + optional photo)
  - Severity:
    * LOW (can wait — does not affect operations)
    * MEDIUM (affects work — workaround possible)
    * HIGH (stops work — no workaround)
    * CRITICAL (product at risk — e.g., temperature rising in cold storage)
  - Auto-assigned issue number (e.g., MT-2026-0912-001)

STEP 2: ROUTING
  - Category-based auto-routing:
    * Electrical → Electrical team
    * Refrigeration → Refrigeration team
    * Forklift → Maintenance department
    * Racking/Infrastructure → Maintenance department
  - Notification to relevant team's dashboard

STEP 3: ACKNOWLEDGEMENT
  - Maintenance team acknowledges: who, when
  - Status: OPEN → ACKNOWLEDGED
  - If CRITICAL: SMS/urgent notification, escalation to plant head

STEP 4: RESOLUTION
  - Maintenance team records: work done, parts used, time spent
  - Status: ACKNOWLEDGED → IN PROGRESS → RESOLVED
  - Resolution notes mandatory

STEP 5: VERIFICATION & CLOSURE
  - Warehouse team (who raised) verifies fix
  - Status: RESOLVED → CLOSED
  - If not fixed → REOPEN with comments

STEP 6: DASHBOARD
  - Open issues by age, severity, category, location
  - Average resolution time
  - Recurring issues (same location, same equipment)
  - Maintenance team performance
```

**Rules:**
- CRITICAL issues (temperature rising, product at risk) must escalate 
  immediately
- Every issue must have a status trail: raised → acknowledged → in progress → 
  resolved → closed
- Warehouse incharge dashboard shows all open maintenance issues 
  affecting warehouse
- Historical log for pattern analysis (e.g., CR1 door fails every month → 
  needs replacement)
- This module is INDEPENDENT from the existing Maintenance Module — but 
  shares the same notification/alert mechanism (see Part 8)

---

### FLOW 10: DASHBOARD REQUIREMENTS (For Warehouse Incharge)

**Primary user: Warehouse Incharge** — needs one screen to see everything.

```
DASHBOARD PANELS:

1. STOCK SNAPSHOT
   - Total FG stock (by material, by warehouse)
   - Status breakdown: OK/Available / QC Hold / Hold / Bulk / Rejected / Sample
   - FIFO aging buckets: 0-30 / 31-60 / 61-90 / 90+ days
   - Low stock alerts (if applicable)

2. HOLD TRACKING (CRITICAL — replaces WhatsApp memory)
   - All materials currently on HOLD
   - For each: material, batch, qty, pallets, locations, 
     reason, since when (aging), who placed hold
   - Aging alerts: amber > 3 days, red > 7 days (configurable)
   - Group/filter by: reason, material, age, department
   - Action: "Follow up with QC" button (sends system reminder)

3. BULK TRACKING
   - All bulk materials pending repacking
   - Aging, quantity, location
   - Reason: over-production vs defective
   - Packing team queue: what needs packing next (FIFO on bulk age)
   - Transfer to packing status: sent / received back

4. QC PENDING QUEUE (for QC team)
   - New FG inwards awaiting inspection
   - SLA timer per item
   - Released today / this week

5. DISPATCH STATUS
   - Today's dispatches: vehicle, party, materials, status
   - Pending dispatches (orders not yet fulfilled)
   - FIFO pick suggestions for today's dispatch
   - Export containers scheduled

6. TRANSFERS
   - In-transit transfers (origin, destination, expected arrival)
   - Recent transfers completed
   - Pending receipt confirmations (at 3PL or other plant)

7. MAINTENANCE ISSUES
   - Open issues by severity, age
   - Critical issues highlighted

8. LOCATION MAP (Rack Digital Twin — like Store Register v13)
   - Visual map of CR1, CR2 — block/position/floor grid
   - Color-coded:
     * Green = empty
     * Red = full (occupied)
     * Blue = partial (same material, space available)
     * Yellow = mix (multiple batches, same material)
     * Orange = HOLD (material on hold)
     * Purple = search result (highlighted)
     * Grey = blocked/unavailable
   - Click pallet → see: material, batch, qty, status, age, hold reason
   - Search: highlight all locations of a material/batch

9. STOCK LEDGER / REGISTER (like Store Register + DSR SEPT-2026 sheet)
   - Transaction history: every inward, issue, move, transfer, 
     adjustment, hold, release
   - Columns (matching DSR):
     DATE | SHIFT | FG CODE | Product | PALLET NO | BATCH NO | QTY | 
     LOCATION | REMARK | DISPATCH DATE | DISPATCH QTY | BALANCE | 
     VEHICLE NO | WMS IN | WMS IN PERSON
   - Filter by: date, material, batch, location, type
   - Running balance per material/batch/location

10. IN-OUT SUMMARY (like DSR IN-OUT sheet)
    - Per material: IN (shift-wise A/B/C), total, kgs
    - HOLD stock quantity
    - AVAILABLE stock quantity
    - INDENT (requirement)
    - Location-wise breakdown (Limbasi, Coldman, Coldrush, RK, JJ COLD, 
      Krav Kraft)
    - Pending dispatch
    - Export/Domestic classification
```

---

## PART 3: CROSS-FUNCTIONAL INTERACTION MATRIX

| Interaction | From | To | Trigger | Channel | SLA |
|---|---|---|---|---|---|
| FG Inward notification | Warehouse | QC LAB | New FG received | Dashboard + notification | Inspection within X hrs |
| Hold notification | QC LAB | Warehouse, Production | Material placed on hold | Dashboard + notification | Immediate |
| Hold follow-up reminder | System | QC LAB | Aging threshold crossed | Dashboard + notification | Daily digest |
| Bulk repack request | System | Packing Team | Bulk material aging | Dashboard queue | Repack within Y hrs |
| Production hold reason | Production | QC LAB | Batch quality issue | System notification | Immediate |
| Re-inspection request | Production | QC LAB | Issue resolved | System action | QC re-inspect within Z hrs |
| Container approval | Logistics | QC LAB | Export container ready | System checklist | Before loading |
| Maintenance issue | Warehouse | Maintenance | Equipment problem | Ticket + dashboard | Based on severity |
| Maintenance escalation | System | Plant Head | CRITICAL unresolved | Urgent notification | Immediate |
| Transfer notice | Limbasi | Destination WH/3PL | Transfer dispatched | System notification | Before arrival |
| Transfer receipt | Destination WH/3PL | Limbasi | Pallets received | System confirmation | Same day |
| Gate pass verification | Security | Warehouse | Vehicle exit | System verification | At gate |

---

## PART 4: RULES & CONSTRAINTS SUMMARY (System Must Enforce)

### HARD BLOCKS (cannot be overridden without special authority):
1. **HOLD material CANNOT be dispatched to party** — loading sheet cannot 
   include hold-status material
2. **REJECTED material CANNOT be dispatched** — same block
3. **QC HOLD (new inward) CANNOT be dispatched** — must be released first
4. **BULK material CANNOT be dispatched** — must be repacked first
5. **Only QC role can release a hold** — warehouse/production cannot self-release
6. **FIFO violation requires logged override with reason**
7. **One pallet = one material** (no mixing materials) — system rejects mixed 
   pallets
8. **Pallet weight limit enforced** — system blocks adding material beyond 
   configured kg limit
9. **Gate pass required for every vehicle exit**
10. **Loading sheet required for every vehicle loading**
11. **Receiving Sheet requires dual confirmation** (packing + warehouse) — 
    once confirmed, locked

### SOFT RULES (warnings, suggestions):
1. FIFO suggestion — operator can override with reason
2. Location suggestion — operator can override
3. Temperature alert — record actual temperature, warn if above threshold
4. Aging alerts — configurable thresholds
5. SLA timers — visible, not blocking
6. Carton condition warning — flag if DAMAGED/BULGING but allow receiving

### AUDIT TRAIL (must be logged):
- Every status change: who, when, from what, to what, why
- Every location move: from, to, who, when
- Every quantity change: in/out/adjust, who, when, reason
- Every dispatch: what went out, to whom, in which vehicle, gate pass
- Every transfer: origin, destination, who approved, who received
- Every receiving sheet: who received, who confirmed, carton condition noted
- Every hold: reason, who, when → release: who, when

---

## PART 5: DATA MODEL HINTS (For Architect)

**Core Entities:**
1. **Material Master** — code (LFG/SFG), description, UOM (kg/carton), 
   category, pallet_weight_limit (kg), pallet_type (carton/roll/pouch), 
   shelf_life_days
2. **Batch** — batch number, material, production date, production line, shift
3. **Pallet** — pallet ID, material, batch(es) [can be multiple], quantity, 
   weight, status, current location, pallet type (plastic/wooden)
4. **Location** — warehouse, CR, block, position, floor, capacity, 
   current pallet
5. **SAP Warehouse Master** — SAP code, SAP name, plant, type (own/3PL/status), branch, module status mapping (see Appendix D)
6. **Warehouse Master** — code, name, type (own/3PL), SAP code linkage, address, 
   location structure (CR/Block/Floor or flat)
7. **Status Master** — code, description, dispatchable flag, transferable flag, SAP code mapping (standardized — no free text)
8. **Receiving Sheet** — sheet no, date, shift, line, material, batch, 
   pallets, carton conditions, temperatures, packing confirmation, 
   warehouse confirmation
9. **Hold Record** — hold ID, material, batch, pallets, reason, placed by, 
   placed on, released by, released on
10. **Transfer Order** — ref no, source WH, dest WH, materials, pallets, 
   vehicle, status, transfer type (normal/hold/bulk), SAP codes
11. **Loading Sheet** — ref no, date, vehicle, driver, party, materials, 
    pallets, temp, QC approval, gate pass, container details
12. **Dispatch Record** — loading sheet ref, party, date, materials, qty
13. **Maintenance Ticket** — issue no, category, location, severity, 
    raised by, status trail, resolution
14. **Stock Ledger** — running record of all stock movements (matches DSR 
    SEPT-2026 columns)
15. **User/Role** — warehouse, QC, production, packing, maintenance, 
    security, admin

**Key Relationships:**
- One Material → many Batches → many Pallets → one Location each
- One Pallet → one Material → one or more Batches (CORRECTED: can have 
  multiple batches of same material)
- One Pallet → one Status (current) → many Status History records
- One Batch → traceable across multiple warehouses (via transfer records)
- One Loading Sheet → many Pallets → one Gate Pass → one Dispatch
- One Receiving Sheet → many Pallets → dual confirmation (packing + warehouse)

---

## PART 6: RECEIVING SHEET — DIGITAL FORM SPECIFICATION (Detailed)

Since this is the #1 pain point ("ladaai khatam karo"), here is the detailed spec:

**Form: New FG Receiving Sheet**

```
SCREEN 1: HEADER
  [Date: 12/09/2026] (auto, editable)
  [Shift: A ▾] (dropdown: A/B/C)
  [Line: FF ▾] (dropdown: FF/Speciality)
  [Material Code: LFG_____] (search/select from material master)
  [Product Name: ____________] (auto-filled from material code)
  [Batch No: ____________] (manual entry, format validation)
  [Receiving Sheet No: RS-2026-0912-001] (auto-generated, read-only)

SCREEN 2: PALLET TABLE
  Grid with columns:
  | Sr No | Pallet No | Qty | Receiving Time | Total Qty | Carton Condition | Temp (°C) | Remarks |
  
  Row 1: [1] [30673] [60] [09:40] [60]  [OK ▾]        [-18] []
  Row 2: [2] [30675] [60] [09:50] [120] [OK ▾]        [-18] []
  Row 3: [3] [30676] [60] [10:10] [180] [BULGING ▾]   [-16] [Note: sides bulging]
  ...
  
  [+ Add Pallet Row] button
  
  Carton Condition dropdown options:
  - OK
  - BULGING
  - DAMAGED
  - WET
  - SHORT QUANTITY
  - OTHER
  
  If Carton Condition ≠ OK:
    → Remark field becomes mandatory
    → Optional: photo attachment (for future, not required now)
  
  If Temp > -15°C:
    → Amber warning: "Temperature above threshold — please verify"
  
  Total Qty: auto-calculated (sum of all pallets)
  Total Boxes: auto-calculated

SCREEN 3: CONFIRMATION
  PACKING SIDE:
    [Packing Supervisor: ____] (login + confirm)
    [Packing Operator: ____] (login + confirm)
    [Confirm Packing Details] button → locks packing side
  
  WAREHOUSE SIDE:
    [Warehouse Executive: ____] (login + confirm)
    [Warehouse Operator: ____] (login + confirm)
    [Confirm Receipt] button → locks warehouse side
  
  Both sides confirmed → Receiving Sheet LOCKED
  Status: QC HOLD (auto) → sent to QC queue
```

**Dispute Resolution Logic:**
- If packing says "60 cartons sent" and warehouse records "58 received":
  → System flags: SHORT QUANTITY — 2 cartons short
  → Both sides see the flag at confirmation time
  → Must be resolved before sheet is locked (acknowledge with remark)
- If cartons are DAMAGED:
  → Recorded at receiving time with photo (future) or remark (now)
  → Packing side sees it at confirmation — cannot dispute later
- If temperature is high:
  → Recorded — cannot later say "you didn't tell us temperature was high"

---

## PART 7: SAMPLE SCENARIOS (Test Cases — Updated)

**Scenario 1: Normal FG Inward & Dispatch**
Production makes batch L26I070613 (pallets 30069-30085, LFG00613 Myers Everlast Shoestring). Packing packs and delivers. Warehouse fills Receiving Sheet RS-2026-0907-005: 7 pallets, 48-84 cartons each, total 449 cartons. All cartons OK, temp -18°C. Both sides confirm. Sheet locked. QC releases after 4 hours. Order comes from party for 5 pallets. System generates FIFO pick — batch L26I070613 is oldest available. Warehouse picks, loads vehicle GJ14AT7260, loading sheet LS-2026-0907-003, gate pass GP-2026-0907-003. Stock reduced.

**Scenario 2: Hold & Release**
Production makes batch L26I0801088 (LFG01088 Mr. Fries Extra Crispy Cl). 4 pallets received, 90 cartons each. QC finds high temperature in 2 pallets. QC places HOLD on 2 pallets (reason: High Temperature). 2 pallets released. Dashboard shows 2 pallets on hold, aging counter starts. After 2 days, production confirms product re-tested OK. QC re-inspects, releases 2 pallets. All 4 now dispatchable.

**Scenario 3: Inter-Warehouse Transfer of Hold Material**
Limbasi has 4 pallets of LFG00613 on HOLD (thread contamination). Limbasi needs space. Transfer order TO-2026-0912-002: 4 pallets to COLDMAN, type: HOLD TAG. Vehicle loaded, loading sheet generated. Transfer complete. COLDMAN receives 4 pallets with HOLD status. COLDMAN QC must release before dispatch. Full traceability maintained.

**Scenario 4: Bulk Material Flow (CORRECTED)**
Production line makes 2500 cartons of LFG00938. Plan was 2000, allowed 10% extra = 2200. Extra 300 packed in bulk cartons (not branded). Status: BULK. Stored in CR1 cold storage. System notifies packing team: bulk pending repacking. Packing team takes bulk to Packing Department. Repacks 300 cartons into branded cartons. New pallets created. New Receiving Sheet: RS-2026-0915-008, new pallet IDs, new batch reference (or same batch). QC hold. QC release. Dispatchable.

Alternative: Bulk 300 cartons online-added to next LFG00938 production run (mixed with fresh product).

**Scenario 5: Export Container Dispatch**
Party in Dubai orders 20 pallets. Logistics books container (MNBU9105855). QC inspects container ("Ok for loading"), temperature check (-18°C). System generates pick list (FIFO), loading sheet with seal number (MLIN3377853), bolt number (PACK03760905), temperature record, QC approval. Gate pass issued. Container sealed and dispatched.

**Scenario 6: Maintenance Critical Issue**
Warehouse operator notices CR1 temperature rising (-15°C instead of -18°C). Raises CRITICAL maintenance ticket MT-2026-0912-001: "Refrigeration — CR1 temperature rising". Notification to refrigeration team + plant head. Refrigeration team acknowledges in 10 minutes, resolves in 2 hours. Warehouse verifies, closes ticket. Resolution time recorded.

**Scenario 7: FIFO Override**
Party "XYZ Snacks" specifically requests fresher batch. System shows older batch available. Warehouse supervisor overrides FIFO with reason: "Customer request — fresher batch". Logged. Dispatch proceeds with newer batch. FIFO compliance report shows override.

**Scenario 8: Receiving Dispute Prevention**
Packing delivers 7 pallets of LFG00613. Warehouse executive fills Receiving Sheet. Pallet 3 has BULGING cartons, Pallet 5 has 58 cartons (expected 60 — SHORT QUANTITY), Pallet 7 temp is -14°C (amber warning). All conditions recorded at receiving time. Packing supervisor confirms — sees the flags, acknowledges bulging and short qty. Sheet locked. Later, if packing claims "we sent 60 cartons", system shows: "Received 58, SHORT QUANTITY noted, acknowledged by [packing supervisor] at [time]". Dispute resolved — ladaai khatam.

**Scenario 9: Multiple Batches on Same Pallet**
Pallet 30486 has LFG01249 batch L26I101249 (52 cartons) AND LFG01249 batch L26I091249 (32 cartons) — same material, different batches. System allows this (same material). Pallet weight checked against limit. If within limit — accepted. If exceeds — error: "Pallet weight limit exceeded — 1000 kg already loaded".

**Scenario 10: 3PL Inward (from other plant)**
Himmatnagar (Sabarkantha) plant sends SFG material to Limbasi warehouse. SFG arrives via vehicle. Warehouse fills 3PL Inward Register: material code (SFGxxx), batch, qty, pallet IDs, vehicle no, SAP no, SAP executive name, WMS in no, WMS executive name. Material enters Limbasi stock. If from another plant with HOLD tag — enters as HOLD, Limbasi QC must release.

---

## PART 8: MODULE INDEPENDENCE & FUTURE INTEGRATION PATH

**Current State:** All IBF modules are independent:
- Production Module (exists)
- Quality Module (exists)
- Maintenance Module (exists)
- Store Register v13 (exists — RM/PM Store)
- FG Warehouse Module (this — new)

**This module is also independent.** It manages its own:
- User/role management
- Data storage
- Dashboard
- Transactions
- Notifications (internal)

**Future Integration Path (suggested):**

When modules are ready to connect, the recommended approach:

```
Option A: Shared Notification Queue (lightest integration)
- Each module remains independent
- A shared notification/event bus connects them
- When FG Warehouse places hold → notification to Quality Module
- When Quality releases → notification back to FG Warehouse
- When FG Warehouse raises maintenance ticket → notification to 
  Maintenance Module
- No data sharing — only events/messages

Option B: Shared Master Data (medium integration)
- Material master, batch master, user/role shared across modules
- Each module still owns its transactions
- Reduces duplicate data entry

Option C: Unified Dashboard (heavier integration)
- Single dashboard pulls data from all modules
- Cross-module reports (e.g., "material on hold because production 
  issue + maintenance downtime")
- Requires API layer across modules

Option D: Full Integration (future — if justified)
- Single database, modular frontend
- All modules share same backend
- Requires significant rebuild
```

**Recommendation:** Start with Option A (shared notification queue). It is the lowest-cost, lowest-risk way to connect independent modules. Each module continues to work standalone even if another module is down. Move to Option B when master data duplication becomes a pain point. Consider Option C/D only when business scale demands it.

---

## PART 9: OPEN ITEMS & FUTURE CONSIDERATIONS

1. **SAP Integration:** Alpesh will provide complete SAP storage location list. 
   Make this configurable reference data. Deep two-way sync is a future goal.

2. **Barcode/QR Scanning:** Not for now. Will be added later. Design data model 
   to accommodate scan-based entry (pallet ID field already exists — just need 
   scanner input method later).

3. **Batch number auto-validation:** Validate batch format from production 
   system. Current format: L + Year + Month(code) + Day + Sequence 
   (e.g., L26I070613 = 2026, September(I), 07th, sequence 0613).

4. **Mobile-friendly:** Warehouse operators work in -18°C with gloves. 
   Interface must be simple, large buttons, minimal typing, dropdown-heavy.

5. **Offline resilience:** Cold storage areas may have poor connectivity. 
   Queue operations offline, sync when back online.

6. **Complete SAP storage location list:** **RECEIVED.** 110 warehouses documented in Appendix D. All FG-relevant codes mapped to module statuses in Section 1.7.

7. **Shelf life / expiry tracking:** Potato products have shelf life. 
   FEFO (First Expired First Out) option needs to be built as configurable 
   alternative to FIFO.

8. **Repacking workflow:** Detailed sub-flow for bulk → packing department → 
   repack → new pallets → receiving sheet.

9. **Weight-based vs count-based tracking:** Some materials tracked by 
   weight (kg), some by count (cartons). Support both. UOM from material 
   master (e.g., 12, 12.5, 10, 10.5, 15 kg per carton).

10. **DSR Excel compatibility:** The module's stock ledger should be 
    exportable to Excel in the same format as the current DSR (SEPT-2026 
    sheet, CR-1/CR-2 sheets, IN-OUT sheet) so team can transition smoothly.

---

## PART 10: SUCCESS CRITERIA

1. **Zero dispatch of hold materials** — impossible in system
2. **Zero receiving disputes** — Receiving Sheet records everything at 
   receiving time with dual confirmation
3. **QC release turnaround time** — visible and improving
4. **FIFO compliance** — percentage of dispatches that followed FIFO
5. **Hold aging** — no material on hold > threshold without follow-up
6. **Stock accuracy** — physical count vs system count match rate
7. **Dispatch documentation** — 100% loading sheets with gate pass linkage
8. **Maintenance resolution time** — average time from open to close
9. **WhatsApp dependency reduction** — critical actions happen in system, 
   not chat
10. **Pallet weight compliance** — no pallet exceeds weight limit

---

## APPENDIX A: DSR EXCEL STRUCTURE (Reference for Data Model)

The current DSR Excel has these sheets — the module should replicate this data structure:

| Sheet | Purpose | Key Columns |
|-------|---------|-------------|
| FG CODE | Material Master | CODE, DESCRIPTION, UOM, CATEGORY |
| SEPT-2026 | Daily Stock Register (transaction log) | DATE, SHIFT, FG CODE, Product, PALLET NO, BATCH NO, QTY, LOCATION, REMARK, DISPATCH DATE, DISPATCH QTY, BALANCE, VEHICLE NO, WMS IN, WMS IN PERSON |
| CR-1 | CR1 Location-wise stock | BLOCK (location), CODE, PRODUCT, PALLET NO, BATCH, QTY, REMARKS, DISPATCH |
| CR-2 | CR2 Location-wise stock | Same as CR-1 |
| DSR-3PL INWARD | 3PL/other plant inward | Same as SEPT-2026 + SAP NO, SAP EXECUTIVE NAME, WMS IN NO, WMS EXECUTIVE NAME |
| IN-OUT | Daily summary | DATE, CODE, UOM, shift-wise IN (A/B/C), TOTAL, kgs, HOLD, AVAILABLE STOCK, INDENT, LOCATION, shift-wise OUT, PENDING, REMARKS |
| CONTAINER DETAILS | Export container tracking | DATE, LOCATION, VEHICLE NO, CONTAINER NO, SEAL NO, BOLT NO, PRODUCT/BATCH/QTY/KGS, TOTAL |
| REPORT | Daily transaction report | DATE, SHIFT, FG CODE, Product, PALLET NO, BATCH NO, qty, LOCATION, REMARK |
| Sheet1 | SAP warehouse-wise stock | Item No, Description, Whse (SAP code), Batch, Qty, Value |

---

## APPENDIX B: WAREHOUSE RECEIVING SHEET (Current Paper Form)

```
WAREHOUSE RECEIVING SHEET

DATE: ___/___/26    SHIFT: ___    FS CODE: ______    LINE: ______
Product Name: __________________    BATCH: __________

| SR NO | RECEIVING TIME | PALLET NO | QTY | TOTAL QTY | REMARKS |
| 1     |               |           |     |           |         |
| 2     |               |           |     |           |         |
| ...   |               |           |     |           |         |
| 35    |               |           |     |           |         |

SUP. SIGN: ______  P.OPERATER: ______  TOTAL BOXES: ______
W.EXECUTIVE: ______  OPERATOR SIGN: ______  AUTHOURISED SIGN: ______
```

This paper form is the basis for the digital Receiving Sheet in FLOW 1.

---

## APPENDIX C: TERMINOLOGY GLOSSARY

| Term | Meaning (IBF context) |
|------|------------------------|
| LFG | Limbasi Finished Goods (produced at Limbasi plant) |
| SFG | Sabarkantha Finished Goods (produced at Himmatnagar plant) |
| FG | Legacy term — still used in WhatsApp (means LFG usually) |
| RM | Raw Material |
| PM | Packing Material |
| CR | Cold Room (frozen storage at -18°C) |
| CR1 | Cold Room 1 (blocks 01-36, positions A-E, floors 1-4) |
| CR2 | Cold Room 2 (blocks 01-36, positions A-E, floors 1-4) |
| 3PL | Third-party logistics cold storage (COLDMAN, COLDRUSH, RK, JJ COLD, KRAV KRAFT) |
| Party | Customer/Buyer |
| Hold | Material blocked from dispatch (status-based, no physical movement) |
| Bulk | FG packed in bulk cartons (not branded) — over-production or defective |
| Online Add | Bulk material added to future packing line run (mixed with fresh production) |
| QC | Quality Control |
| Putaway | Storing received material in storage location |
| Picking | Retrieving material for dispatch/transfer |
| FIFO | First In First Out |
| FEFO | First Expired First Out |
| Loading Sheet | Document listing what's loaded in vehicle |
| Gate Pass | Security document for vehicle exit |
| Pallet Slip | Paper slip identifying pallet contents (pre-printed number) |
| DSR | Daily Stock Report (the Excel file) |
| Receiving Sheet | Form filled when FG received from packing |
| Bulging | Carton sides bulging — quality concern |
| INAR DAMAGE | Inner damage (inside carton) |
| Bolt No | Export container bolt/seal number |
| LR | Lorry Receipt (for 3PL transfers) |
| LMFGQ | SAP: Limbasi FG Under QC |
| LMFGA | SAP: Limbasi FG Approved |
| LMFGH | SAP: Limbasi FG Hold |
| LMFGBULK | SAP: Limbasi FG Bulk |
| LMFGIN | SAP: Limbasi FG In-Transit |
| LMFGD | SAP: Limbasi FG Dispatch |
| LMFGA-CM | SAP: Limbasi FG at Cold Man (3PL) |
| LMFGA-CR | SAP: Limbasi FG at Cold Rush (3PL) |
| LMFGA-RK | SAP: Limbasi FG at Radhakrishan (3PL) |
| SKFGQ | SAP: Sabarkantha FG Under QC |
| SKFGA | SAP: Sabarkantha FG Approved |
| SKFGH | SAP: Sabarkantha FG Hold |

---

**END OF FLOW DOCUMENT — LEVEL 3 FINAL**

*This document is the single source of truth for the FG Warehouse module. All 7 corrections from Alpesh have been incorporated. Complete SAP Storage Location Master (110 codes) has been added. Real operational data from DSR Excel and Receiving Sheet has been used. Any system design must cover every flow described here. Any module built must enforce every rule in Part 4. Any deviation must be justified against this document.*

*Prepared for: Architect Agent (system design) → Claude Code (module implementation)*

---

## APPENDIX D: COMPLETE SAP STORAGE LOCATION MASTER (All 110 Codes)

*Source: Alpesh Parmar — SAP warehouse master export, September 2026*

### D.1 Limbasi Plant — Finished Goods (20 codes)

| SAP Code | SAP Name | Type | Module Mapping |
|----------|---------|------|----------------|
| LMFGQ | Limbasi FG Under QC Warehouse - Frozen | Status | QC HOLD |
| LMFGA | Limbasi FG Approved Warehouse - Frozen | Status | OK/AVAILABLE |
| LMFGH | Limbasi FG Hold Warehouse | Status | HOLD |
| LMFGD | Limbasi FG Dispatch Warehouse | Status | DISPATCHED |
| LMFGIN | Limbasi FG In-Transit Warehouse - Frozen | Status | IN TRANSIT |
| LMFGBULK | Limbasi FG Bulk Warehouse | Status | BULK |
| LMFGCS | Limbasi FG Customer Sample Warehouse | Status | CUSTOMER SAMPLE |
| LMFGSMPL | Limbasi FG Sample Warehouse - Frozen | Status | SAMPLE |
| LMFGVIND | Limbasi FG Virtual INDICOLD Approved - Frozen | 3PL | Indicold (virtual) |
| LMFGA-CM | Cold Man Approved Warehouse - Frozen | 3PL | Cold Man |
| LMFG-CMU | Cold Man (QC variant) | 3PL | Cold Man (QC pending) |
| LMFGA-CR | Cold Rush Approved Warehouse - Frozen | 3PL | Cold Rush |
| LMFGACRH | Cold Rush Approved - Coldrush variant | 3PL | Cold Rush (alt) |
| LMFGA-RK | Radhakrishan Cold Store | 3PL | Radhakrishan |
| LMFGARKU | Radha Krishna Cold Storage - GJ | 3PL | Radha Krishna (GJ) |
| LMFGA-MZ | MZ Cold Storage | 3PL | MZ |
| LMFGAMAR | Amar Cold Store Approved - Frozen | 3PL | Amar |
| LMFGAWS | Wholesome FG Approved Warehouse | 3PL | Wholesome |
| LMFGASK | Sabarkantha Cold Storage (Limbasi FG at SK) | Cross-plant | Limbasi FG at SK |
| LMFGA-HO | IBF Corporate Head Office | Other | FG at Head Office |

### D.2 Limbasi Plant — Raw Material (22 codes)

| SAP Code | SAP Name | Type |
|----------|---------|------|
| LMRMA | Limbasi RM Approved Warehouse - Frozen | Status: OK |
| LMRMQ | Limbasi RM Under QC Warehouse - Frozen | Status: QC HOLD |
| LMRMIN | Limbasi RM In-Transit Warehouse - Frozen | Status: IN TRANSIT |
| LMRMPX | Limbasi RM Premix Warehouse | Special: Premix |
| LMRMALAX | Limbasi RM Laxmi Cold Storage | 3PL: Laxmi |
| LMRMDSAG | Limbasi RM DS Agro Cold Storage | 3PL: DS Agro |
| LMRMDWAC | Limbasi RM Dwarkesh Cold Store | 3PL: Dwarkesh |
| LMRMJAYK | Limbasi RM Jay Kishan Cold Storage | 3PL: Jay Kishan |
| LMRMKAIC | Limbasi RM Kailashpati Cold Store | 3PL: Kailashpati |
| LMRMKALC | Limbasi RM Kalp Cold Storage | 3PL: Kalp |
| LMRMKDR | Limbasi RM Kedar Cold Store | 3PL: Kedar |
| LMRMKNTI | Limbasi RM Kanti Cold Store | 3PL: Kanti |
| LMRMKRIC | Limbasi RM Krishna Cold Store | 3PL: Krishna |
| LMRMNILK | Limbasi RM Nilkanth Cold Store | 3PL: Nilkanth |
| LMRMPAVC | Limbasi RM Pavan Cold Store | 3PL: Pavan |
| LMRMRAMC | Limbasi RM Ramdev Cold Store | 3PL: Ramdev |
| LMRMREAL | Limbasi RM Real Hi-Tech Cold Store | 3PL: Real Hi-Tech |
| LMRMRHTC | Limbasi RM Raam Hi-Tech Cold Store | 3PL: Raam Hi-Tech |
| LMRMRUSC | Limbasi RM Rushi Cold Store | 3PL: Rushi |
| LMRMSATC | Limbasi RM Satyam Cold Storage | 3PL: Satyam |
| LMRMSHAC | Limbasi RM Shakti Cold Store | 3PL: Shakti |
| LMRMSHIC | Limbasi RM Shivam Hightech Cold Storage | 3PL: Shivam |
| LMRMSHRC | Limbasi RM Shri Salasar Balaji Cold Storage | 3PL: Salasar Balaji |
| LMRMSKMC | Limbasi RM SKM Cold Store | 3PL: SKM |
| LMRMVISH | Limbasi RM Vishnu Cold Store | 3PL: Vishnu |
| LMRMVKRM | Limbasi RM Vishwakarma Cold Store | 3PL: Vishwakarma |
| LMRMVSDV | Limbasi RM Vishnudevi Cold Storage | 3PL: Vishnudevi |

### D.3 Limbasi Plant — Packing Material (2 codes)

| SAP Code | SAP Name | Type |
|----------|---------|------|
| LMPMA | Limbasi PM Approved Warehouse - Frozen | Status: OK |
| LMPMQ | Limbasi PM Under QC Warehouse - Frozen | Status: QC HOLD |

### D.4 Limbasi Plant — Ingredients & Additives (2 codes)

| SAP Code | SAP Name | Type |
|----------|---------|------|
| LMIAA | Limbasi IA Approved Warehouse - Frozen | Status: OK |
| LMIAQ | Limbasi IA Under QC Warehouse - Frozen | Status: QC HOLD |

### D.5 Limbasi Plant — Other (13 codes)

| SAP Code | SAP Name | Type |
|----------|---------|------|
| LMFMT | Limbasi Warehouse – Farmton Foods Pvt Ltd | 3PL: Farmton |
| LMGOA | Limbasi Grade Out Material Warehouse - Frozen | Status: REJECTED |
| LMFGCS | (already in FG list above) | — |
| LMIW | Limbasi Material Issue Warehouse | Issue |
| LMNPD | Limbasi New Product Development | NPD |
| LMNPD-CR | Cold Rush - NPD | 3PL: Cold Rush (NPD) |
| LMQCHOLD | Limbasi QC Hold - RM and PM | Status: QC HOLD (RM/PM) |
| LMQTVRTL | Quality Deduction Virtual Warehouse Limbasi | Virtual |
| LMRT | Limbasi Returnable Warehouse - Frozen | Returnable |
| LMSF | Limbasi Shop Floor | Shop Floor |
| LMSSA | Limbasi Store & Spares Approved - Frozen | Store/Spares |
| LMSW | Limbasi Scrap & Waste Warehouse - Frozen | Scrap |
| LMTPW | Limbasi Third Party Material Warehouse | Third Party |
| LMTR | Limbasi Trading Approved Warehouse - Frozen | Trading |
| LMTRQ | Limbasi Trading Under QC Warehouse - Frozen | Trading QC |

### D.6 Sabarkantha Plant — Finished Goods (24 codes)

| SAP Code | SAP Name | Type | Module Mapping |
|----------|---------|------|----------------|
| SKFGQ | SK FG Under QC Warehouse - Frozen | Status | QC HOLD |
| SKFGA | SK FG Approved Warehouse - Frozen | Status | OK/AVAILABLE |
| SKFGH | SK FG Hold Warehouse | Status | HOLD |
| SKFGBULK | Himmatnagar FG Bulk Warehouse | Status | BULK |
| SKFGCS | Himmatnagar FG Customer Sample Warehouse | Status | CUSTOMER SAMPLE |
| SKFGSMPL | Himmatnagar FG Sample Warehouse | Status | SAMPLE |
| SKGJFGIN | SK Goods In-Transit Warehouse - Frozen | Status | IN TRANSIT |
| SKGOA | SK Grade Out Material Warehouse | Status | REJECTED |
| SKFGA-FR | Frostine Cold Storage | 3PL | Frostine |
| SKFGAFR2 | Frostine Elite Cold Storage-2 | 3PL | Frostine Elite |
| SKFGACR | Coldrush Logistics Mehsana | 3PL | Cold Rush Mehsana |
| SKFGACR2 | Coldrush Logistics Mehsana-2 | 3PL | Cold Rush Mehsana-2 |
| SKFGAFNK | Nikhar Cold Storage | 3PL | Nikhar |
| SKFGAKKF | Kravekraft Foods WH | 3PL | Kravekraft |
| SKFGASML | Shree Maruti Integrated Logistics | 3PL | Shree Maruti |
| SKFGAVCM | Virtual Cold Man Approved - Frozen | 3PL | Cold Man (virtual) |
| SKFGJJAF | Jai Jinendra Agro Foods LLP | 3PL | Jai Jinendra |
| SKJJH | Jai Jinendra - Hold WH | 3PL | Jai Jinendra (Hold) |
| SK1FGCR | Cold Rush Plant Warehouse | 3PL | Cold Rush Plant |
| SK1FGCRM | Cold Rush Mehsana Warehouse | 3PL | Cold Rush Mehsana |
| SK1FGCM | Cold Man Approved - Frozen | 3PL | Cold Man |
| SK1FGAM | Amar Cold Store Approved - Frozen | 3PL | Amar |
| SK1FGARK | Radha Krishna Cold Storage | 3PL | Radha Krishna |
| SK1FGABT | Brattle Warehouse | 3PL | Brattle |
| SKSALES | SK Sales | Sales | Dispatch/Sales |

### D.7 Sabarkantha Plant — Raw Material, PM, IA, Other (18 codes)

| SAP Code | SAP Name | Type |
|----------|---------|------|
| SKRMA | SK RM Approved Warehouse - Frozen | RM: OK |
| SKRMQ | SK RM QC Warehouse - Frozen | RM: QC HOLD |
| SKRMPMH | Himmatnagar RM PM Hold Warehouse | RM/PM: HOLD |
| SKRMQCRT | SK Potato QC Reject (Pick up) warehouse | RM: REJECTED |
| SKPMA | SK PM Approved Warehouse - Frozen | PM: OK |
| SKPMQ | SK PM Under QC Warehouse - Frozen | PM: QC HOLD |
| SKIAA | SK IA Approved Warehouse - Frozen | IA: OK |
| SKIAQ | SK IA Under QC Warehouse - Frozen | IA: QC HOLD |
| SKQCHOLD | Himmatnagar QC Hold - RM and PM | RM/PM: QC HOLD |
| SKQTVRTL | Quality Deduction Virtual Warehouse Ilol | Virtual |
| SKNPD | Himmatnagar NPD | NPD |
| SKPACKIN | SK Approved Warehouse - Packing | Packing |
| SKBOILER | SK Approved Warehouse - Boiler | Boiler |
| SKBSVRTL | Bags And Soil Virtual Warehouse Ilol | Virtual |
| SKGJFR | Sabarkantha Frozen | Frozen (general) |
| SKIQF | SK Approved Warehouse - Refrigeration | Refrigeration |
| SKRT | SK Returnable Warehouse - Frozen | Returnable |
| SKJJH | Jai Jinendra Hold (also in FG list) | 3PL Hold |

### D.8 Patan Plant (2 codes)

| SAP Code | SAP Name | Type |
|----------|---------|------|
| PTGJFGIN | Patan Goods In-Transit Warehouse - Frozen | IN TRANSIT |
| PTSSA | Patan Stores & Spares Approved | Store/Spares |

### D.9 Other (1 code)

| SAP Code | SAP Name | Type |
|----------|---------|------|
| RTL | Service Warehouse | Retail/Service |

---

## APPENDIX E: SAP CODE → MODULE STATUS QUICK REFERENCE

```
┌──────────────────────────────────────────────────────────────────┐
│  MODULE STATUS    │ LIMBASI SAP  │ SABARKANTHA SAP  │ DISPATCH?  │
├───────────────────┼──────────────┼──────────────────┼────────────┤
│  QC HOLD (new)    │ LMFGQ        │ SKFGQ            │ NO         │
│  OK / AVAILABLE   │ LMFGA        │ SKFGA            │ YES        │
│  HOLD             │ LMFGH        │ SKFGH            │ NO         │
│  BULK             │ LMFGBULK     │ SKFGBULK          │ NO         │
│  DISPATCHED       │ LMFGD        │ (SKSALES)        │ N/A        │
│  IN TRANSIT       │ LMFGIN       │ SKGJFGIN         │ N/A        │
│  CUSTOMER SAMPLE  │ LMFGCS       │ SKFGCS           │ NO         │
│  SAMPLE           │ LMFGSMPL     │ SKFGSMPL         │ NO         │
│  REJECTED         │ LMGOA        │ SKGOA            │ NO         │
│  SCRAP            │ LMSW         │ —                │ NO         │
│                   │              │                  │            │
│  3PL TRANSFER →   │ LMFGA-XX    │ SKFGAXX/SK1FGXX  │ Per status │
└──────────────────────────────────────────────────────────────────┘
```

---

**END OF FLOW DOCUMENT — LEVEL 3 FINAL**

*All 7 corrections incorporated. SAP Storage Location Master complete (110 codes). 
Real DSR data, Receiving Sheet form, and operational WhatsApp data used as evidence. 
This document is the single source of truth for the FG Warehouse module.*

*Prepared for: Architect Agent (system design) → Claude Code (module implementation)*
