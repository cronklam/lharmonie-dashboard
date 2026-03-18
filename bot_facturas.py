#!/usr/bin/env python3
"""
Bot de Telegram — Receptor de Facturas Lharmonie
================================================
v2: Agrega flujo de corrección post-carga
"""

import os
import io
import json
import base64
import logging
import asyncio
from datetime import datetime
from pathlib import Path

from telegram import ReplyKeyboardMarkup, ReplyKeyboardRemove

TELEGRAM_TOKEN    = os.environ.get("TELEGRAM_TOKEN", "8704393994:AAE70ygMZvJ9pb1Tj9sK1qdoTdVz5TmuwKc")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
SHEETS_ID         = os.environ.get("SHEETS_ID", "")
SHEETS_TAB        = "Facturas"
LOG_FILE          = "facturas_procesadas.json"

# IDs que reciben notificación cada vez que se carga una factura
# Cache de proveedores conocidos (se carga al iniciar)
PROVEEDORES_CONOCIDOS = []  # list of {"razon": "...", "fantasia": "...", "cuit": "..."}

def cargar_proveedores_conocidos():
    """Carga la lista de proveedores del Sheet para usarla como contexto en extracción."""
    global PROVEEDORES_CONOCIDOS
    try:
        gc, sh = get_sheets_client()
        if not sh:
            return
        wp = sh.worksheet("Proveedores")
        vals = wp.get_all_values()
        header_idx = 0
        for i, row in enumerate(vals):
            if "Razón Social" in row or "Razon Social" in row:
                header_idx = i
                break
        provs = []
        for row in vals[header_idx+1:]:
            if not any(row): continue
            razon    = row[0].strip() if len(row) > 0 else ""
            fantasia = row[1].strip() if len(row) > 1 else ""
            cuit     = row[2].strip() if len(row) > 2 else ""
            if razon:
                provs.append({"razon": razon, "fantasia": fantasia, "cuit": cuit})
        PROVEEDORES_CONOCIDOS = provs
        log.info(f"✅ Proveedores conocidos cargados: {len(provs)}")
    except Exception as e:
        log.warning(f"No se pudieron cargar proveedores: {e}")

NOTIFY_IDS = [
    6457094702,  # Martín
    5358183977,  # Iara Zayat
    7354049230,  # Iara Rodriguez
]

LOCALES = [
    "Lharmonie 1 - Seguí 3611",
    "Lharmonie 2 - Nicaragua 6068",
    "Lharmonie 3 - Maure 1516",
    "Lharmonie 4 - Zabala 1925",
    "Lharmonie 5 - Libertador 3118",
]

TIPOS_COMPROBANTE = [
    "📄 Factura",
    "📦 Remito",
    "💸 Pago manual",
]

CATEGORIAS = [
    "🥦 Materia Prima / Insumos",
    "📦 Packaging / Descartables",
    "🧹 Limpieza / Higiene",
    "👥 Personal / RRHH",
    "💻 Servicios / Software",
    "🔧 Mantenimiento / Reparaciones",
    "📣 Marketing / Publicidad",
    "🏛️ Impuestos / Tasas",
    "🚚 Logística / Flete",
    "🍽️ Vajilla / Equipamiento",
    "❓ Otro",
]

TIPOS_DOC = [
    "Factura A",
    "Factura B", 
    "Factura C",
    "Remito",
    "Ticket",
    "Otro",
]

ESTADOS_PAGO = [
    "🏦 A pagar — Transferencia",
    "💵 Pagado en efectivo",
    "✅ Pagado previamente",
]

# Campos que se pueden corregir después de cargar
CAMPOS_CORREGIBLES = ["📍 Local", "🏷️ Categoría", "💳 Estado de pago", "📄 Tipo de comprobante", "🏢 Proveedor", "📦 Ítems (precio/cantidad)", "💰 Modificar total"]
CAMPO_KEY = {"📍 Local": "local", "🏷️ Categoría": "categoria", "💳 Estado de pago": "estado_pago", "📄 Tipo de comprobante": "tipo_doc", "🏢 Proveedor": "proveedor", "📦 Ítems (precio/cantidad)": "items", "💰 Modificar total": "total"}

PROVEEDORES_CAT = {
    "QNM": "🥦 Materia Prima / Insumos",
    "QUERCUS": "🥦 Materia Prima / Insumos",
    "BAVOSI": "🥦 Materia Prima / Insumos",
    "ALYSER": "🥦 Materia Prima / Insumos",
    "CUERVO HERMANOS": "🥦 Materia Prima / Insumos",
    "ICEFERAS": "🥦 Materia Prima / Insumos",
    "BERARDI": "🥦 Materia Prima / Insumos",
    "SERENISIMA": "🥦 Materia Prima / Insumos",
    "IVIPAN": "🥦 Materia Prima / Insumos",
    "ALIMENTOS ORIGINALES": "🥦 Materia Prima / Insumos",
    "ALIMENTOS AVIV": "🥦 Materia Prima / Insumos",
    "LODISER": "🥦 Materia Prima / Insumos",
    "VILLARES": "🥦 Materia Prima / Insumos",
    "BIOPACKAGING": "📦 Packaging / Descartables",
    "DISEÑO BAGS": "📦 Packaging / Descartables",
    "EMEIKA": "📦 Packaging / Descartables",
    "ARCUCCI": "🧹 Limpieza / Higiene",
    "MOOP": "🧹 Limpieza / Higiene",
    "CLEAN PIPES": "🧹 Limpieza / Higiene",
    "VOLF": "🍽️ Vajilla / Equipamiento",
    "HARDBAR": "🍽️ Vajilla / Equipamiento",
    "GETNET": "💻 Servicios / Software",
    "POSTA EXPRESS": "🚚 Logística / Flete",
    "BISTROSOFT": "💻 Servicios / Software",
    "ORANGEDATA": "💻 Servicios / Software",
    "RIPANI": "🔧 Mantenimiento / Reparaciones",
    "GOLDFARB": "💻 Servicios / Software",
    "MAKE IT HAPPEN": "📣 Marketing / Publicidad",
    "AFIP": "🏛️ Impuestos / Tasas",
    "FIMA": "⚠️ EXCLUIR - Inversión",
    "BERG": "⚠️ EXCLUIR - Retiro socio",
    "SEMM": "⚠️ EXCLUIR - Retiro socio",
    "JAFIF": "⚠️ EXCLUIR - Personal",
    "MASRI": "⚠️ EXCLUIR - Retiro socio",
}

def categorizar_auto(nombre: str):
    u = nombre.upper()
    for k, v in PROVEEDORES_CAT.items():
        if k in u:
            return v
    return None

def es_estado_pagado(estado_pago: str) -> bool:
    if not estado_pago:
        return False
    e = estado_pago.lower()
    if "a pagar" in e:
        return False
    return "pagado" in e or "previamente" in e

def estado_para_sheet(estado_pago: str) -> str:
    if es_estado_pagado(estado_pago):
        return estado_pago
    return "A pagar"

logging.basicConfig(format="%(asctime)s — %(levelname)s — %(message)s", level=logging.INFO)
log = logging.getLogger(__name__)

estado_usuario: dict = {}
file_ids_procesados: set = set()
hubo_overload: bool = False

def pdf_to_image(pdf_bytes: bytes) -> bytes:
    import fitz
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[0]
    mat = fitz.Matrix(2.0, 2.0)
    pix = page.get_pixmap(matrix=mat)
    return pix.tobytes("jpeg")

async def extraer_factura(image_bytes: bytes, media_type: str = "image/jpeg") -> dict:
    import anthropic
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    img_b64 = base64.standard_b64encode(image_bytes).decode()
    # Build proveedores context
    if PROVEEDORES_CONOCIDOS:
        prov_lines = []
        for p in PROVEEDORES_CONOCIDOS[:30]:  # max 30
            line = f"  - {p['razon']}"
            if p['fantasia']:
                line += f" (también conocido como: {p['fantasia']})"
            if p['cuit']:
                line += f" CUIT: {p['cuit']}"
            prov_lines.append(line)
        proveedores_ctx = "\n".join(prov_lines)
    else:
        proveedores_ctx = "(sin proveedores registrados aún)"

    prompt = """Sos un sistema de extracción de datos de facturas, remitos y tickets de compra argentinos para Lharmonie / Cronklam SRL (cafeterías en Buenos Aires).
Extraé los datos y respondé SOLO con JSON válido, sin texto adicional ni backticks:
{
  "proveedor": "nombre completo del emisor. Si dice NOMBRE COMERCIO o está en blanco, inferí según los productos (ej: si son frutas/verduras → Verdulería, si son lácteos → Lácteos, etc.)",
  "cuit_proveedor": "XX-XXXXXXXX-X o null",
  "numero_comprobante": "XXXXX-XXXXXXXX",
  "tipo": "Factura A / Factura B / Factura C / Remito / Ticket / Otro",
  "fecha": "DD/MM/AAAA",
  "subtotal": número sin símbolos,
  "iva_21": número o 0,
  "iva_105": número o 0,
  "iva_27": número o 0,
  "percep_iibb": número o 0,
  "percep_iva": número o 0,
  "otros_impuestos": número o 0,
  "total": número total del comprobante,
  "items": [{"descripcion": "nombre del producto", "cantidad": número, "unidad": "kg/L/u/un", "precio_unitario": número por unidad o kg, "subtotal_item": número, "iva_item": 0, "total_item": número}],
  "condicion_pago": "contado/transferencia/cuenta corriente 30 dias/etc",
  "pagada": true si dice PAGADO/COBRADO,
  "categoria_sugerida": "inferi la categoría según los productos: frutas/verduras→Materia Prima, lácteos→Materia Prima, packaging→Packaging, limpieza→Limpieza, etc.",
  "observaciones": "dato relevante o null"
}
Reglas importantes:
- montos siempre como números sin símbolos (37329 no $37.329)
- IMPORTANTE: Si el nombre del proveedor no está claro o es genérico, intentá identificarlo usando esta lista de proveedores conocidos de Lharmonie. Usá el nombre exacto de "Razón Social" si lo reconocés:
""" + proveedores_ctx + """
- Para tickets de verdulería/frutería con formato '2.075kg × $2000/kg = $4150': cantidad=2.075, unidad=kg, precio_unitario=2000, total_item=4150
- Para 'Venta por Unidad 3un × $3900/un = $11700': cantidad=3, unidad=u, precio_unitario=3900, total_item=11700
- Extraé TODOS los ítems sin límite, sin excepción
- Si el proveedor dice 'NOMBRE COMERCIO' inferí por el contenido (frutas/verduras → poné 'Verdulería/Frutería')
- Si no podés leer algo, usá null"""
    for _attempt in range(4):
        try:
            response = client.messages.create(
                model="claude-opus-4-6",
                max_tokens=3000,
                messages=[{"role": "user", "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": img_b64}},
                    {"type": "text", "text": prompt}
                ]}]
            )
            break
        except Exception as _e:
            if "529" in str(_e) or "overloaded" in str(_e).lower():
                wait = 10 * (_attempt + 1)
                log.warning(f"⚠️ Anthropic sobrecargado, esperando {wait}s... (intento {_attempt+1}/4)")
                import time as _t; _t.sleep(wait)
                if _attempt == 3: raise
            else:
                raise
    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())

async def extraer_pago_manual(texto: str) -> dict:
    import anthropic
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    prompt = f"""El siguiente texto describe un pago de una cafetería argentina. Respondé SOLO con JSON:
{{"proveedor": "nombre", "tipo": "Pago manual", "fecha": "DD/MM/AAAA", "total": número, "condicion_pago": "efectivo/transferencia/etc", "pagada": true, "observaciones": "descripción"}}
Texto: {texto}"""
    for _attempt in range(4):
        try:
            response = client.messages.create(
                model="claude-opus-4-6",
                max_tokens=500,
                messages=[{"role": "user", "content": prompt}]
            )
            break
        except Exception as _e:
            if "529" in str(_e) or "overloaded" in str(_e).lower():
                wait = 10 * (_attempt + 1)
                log.warning(f"⚠️ Anthropic sobrecargado, esperando {wait}s... (intento {_attempt+1}/4)")
                import time as _t; _t.sleep(wait)
                if _attempt == 3: raise
            else:
                raise
    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())

def guardar_local(datos: dict):
    registros = []
    if Path(LOG_FILE).exists():
        try:
            with open(LOG_FILE, "r", encoding="utf-8") as f:
                registros = json.load(f)
        except:
            registros = []
    registros.append(datos)
    with open(LOG_FILE, "w", encoding="utf-8") as f:
        json.dump(registros, f, ensure_ascii=False, indent=2)

def get_sheets_client():
    import gspread
    from google.oauth2.service_account import Credentials
    scopes = ["https://www.googleapis.com/auth/spreadsheets"]
    creds_json = os.environ.get("GOOGLE_CREDENTIALS", "")
    if not creds_json:
        return None, None
    creds = Credentials.from_service_account_info(json.loads(creds_json), scopes=scopes)
    gc = gspread.authorize(creds)
    sh = gc.open_by_key(SHEETS_ID)
    return gc, sh


IMGBB_KEY = os.environ.get("IMGBB_KEY", "aa10c0647e6888ce1e47072d2f0cf4e7")

def subir_imagen_drive(image_bytes: bytes, filename: str) -> str:
    """Sube imagen a imgBB y retorna el link directo."""
    try:
        import urllib.request
        import urllib.parse
        import base64
        img_b64 = base64.b64encode(image_bytes).decode()
        data = urllib.parse.urlencode({
            "key": IMGBB_KEY,
            "image": img_b64,
            "name": filename.replace(".jpg", ""),
        }).encode()
        req = urllib.request.Request("https://api.imgbb.com/1/upload", data=data, method="POST")
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode())
        link = result.get("data", {}).get("url")
        if link:
            log.info(f"✅ Imagen subida a imgBB: {link}")
            return link
        log.warning(f"⚠️ imgBB sin URL: {result}")
        return None
    except Exception as e:
        log.error(f"❌ imgBB upload error: {e}", exc_info=True)
        return None

def volcar_sheets(datos: dict):
    if not SHEETS_ID:
        return
    try:
        gc, sh = get_sheets_client()
        if not sh:
            return
        try:
            ws = sh.worksheet(SHEETS_TAB)
        except:
            ws = sh.add_worksheet(SHEETS_TAB, rows=1000, cols=26)
            ws.append_row(["Fecha FC","Semana","Mes","Año","Proveedor","CUIT","Tipo Doc","# PV","# Factura","Categoría","Local","Cajero","Importe Neto","Descuento","IVA 21%","IVA 10.5%","Percep IIBB","Percep IVA","Total","Medio de Pago","Estado","Fecha de Pago","Observaciones","Procesado","Imagen"])

        # Anti-duplicado: verificar si ya existe esta factura
        try:
            existing = ws.get_all_values()
            h_idx = 0
            for i, row in enumerate(existing):
                if "Proveedor" in row or "Fecha FC" in row: h_idx = i; break
            hdrs = existing[h_idx]
            def _gcol(row, cn):
                try:
                    idx = hdrs.index(cn)
                    return row[idx].strip() if idx < len(row) else ""
                except: return ""
            nro_nuevo = str(datos.get("numero_comprobante","")).strip()
            prov_nuevo = str(datos.get("proveedor","")).strip().lower()
            local_nuevo = str(datos.get("local","")).strip().lower()
            if nro_nuevo:
                for row in existing[h_idx+1:]:
                    if not any(row): continue
                    nro_ex = _gcol(row, "# Factura").strip()
                    prov_ex = _gcol(row, "Proveedor").strip().lower()
                    local_ex = _gcol(row, "Local").strip().lower()
                    pv_ex = _gcol(row, "# PV").strip()
                    nro_full = f"{pv_ex}-{nro_ex}" if pv_ex else nro_ex
                    if (nro_ex == nro_nuevo or nro_full == nro_nuevo) and prov_ex[:8] == prov_nuevo[:8] and local_ex == local_nuevo:
                        log.warning(f"⚠️ Factura duplicada detectada: {prov_nuevo} {nro_nuevo} — NO se guarda")
                        return
        except Exception as e:
            log.warning(f"No se pudo verificar duplicado: {e}")

        fecha_str = datos.get("fecha", "")
        semana, mes, anio = "", "", ""
        try:
            if fecha_str:
                dt = datetime.strptime(fecha_str, "%d/%m/%Y")
                semana = dt.isocalendar()[1]
                mes = dt.strftime("%B")
                anio = dt.year
        except:
            pass

        comprobante = datos.get("numero_comprobante", "") or ""
        pv, nro_factura = "", ""
        if "-" in comprobante:
            partes = comprobante.split("-", 1)
            pv = partes[0].lstrip("0") or "0"
            nro_factura = partes[1].lstrip("0") or "0"
        else:
            nro_factura = comprobante

        estado_pago = datos.get("condicion_pago", "")
        ws.append_row([
            fecha_str, semana, mes, anio,
            datos.get("proveedor",""), datos.get("cuit_proveedor",""),
            datos.get("tipo",""), pv, nro_factura,
            datos.get("categoria",""), datos.get("local",""), datos.get("cajero",""),
            datos.get("subtotal",0), 0,
            datos.get("iva_21",0), datos.get("iva_105",0), datos.get("percep_iibb",0), datos.get("percep_iva",0),
            datos.get("total",0),
            estado_pago,
            estado_para_sheet(estado_pago),
            datos.get("fecha_pago",""),
            datos.get("observaciones",""),
            datos.get("procesado_en",""),
            datos.get("imagen_link",""),
        ])

        # Proveedores
        try:
            wp = sh.worksheet("Proveedores")
        except:
            wp = sh.add_worksheet("Proveedores", rows=500, cols=13)
            wp.append_row(["Razón Social","Nombre Fantasía","CUIT","Alias / CBU","Banco","Condición de Pago","Categoría","Teléfono","Email","Contacto","Última Compra","Total Comprado","Observaciones"])

        prov_values = wp.get_all_values()
        prov_header_idx = 0
        for idx, row in enumerate(prov_values):
            if "Razón Social" in row or "Razon Social" in row:
                prov_header_idx = idx
                break
        prov_data = prov_values[prov_header_idx + 1:]
        import re as _re
        def norm_prov(s):
            s = str(s).upper().strip()
            s = _re.sub(r'[^A-Z0-9 ]', ' ', s)
            s = _re.sub(r'\s+', ' ', s).strip()
            return s

        prov_index = {}
        prov_index_norm = {}
        for i, row in enumerate(prov_data):
            if not any(row): continue
            cuit = row[2].strip() if len(row) > 2 else ""
            razon = row[0].strip().upper() if len(row) > 0 else ""
            key = cuit.strip() if cuit.strip() else razon
            if key:
                total_prev = 0
                try:
                    total_prev = float(str(row[11]).replace("$","").replace(".","").replace(",",".")) if len(row) > 11 and row[11] else 0
                except:
                    pass
                prov_index[key] = {"row": prov_header_idx + 2 + i, "total": total_prev}
                if not cuit.strip():
                    prov_index_norm[norm_prov(razon)] = key

        cuit_prov = datos.get("cuit_proveedor","") or ""
        razon_prov = datos.get("proveedor","").strip().upper()
        cuit_clean = cuit_prov.strip()

        if cuit_clean and cuit_clean in prov_index:
            key_prov = cuit_clean
        elif razon_prov in prov_index:
            key_prov = razon_prov
        else:
            norm_key = norm_prov(razon_prov)
            key_prov = prov_index_norm.get(norm_key, norm_key)
        total_factura = datos.get("total", 0) or 0

        if key_prov in prov_index:
            row_num = prov_index[key_prov]["row"]
            nuevo_total = prov_index[key_prov]["total"] + total_factura
            wp.update(values=[[datos.get("fecha",""), round(nuevo_total, 2)]], range_name=f"K{row_num}:L{row_num}")
        else:
            wp.append_row([
                datos.get("proveedor",""), "", cuit_prov, "", "",
                estado_pago, datos.get("categoria",""), "", "", "",
                datos.get("fecha",""), round(total_factura, 2), "",
            ])

        # Artículos
        items_raw = datos.get("items", [])
        if isinstance(items_raw, dict):
            items_raw = list(items_raw.values())
        items = []
        for it in (items_raw or []):
            if isinstance(it, dict):
                items.append(it)
            elif isinstance(it, str):
                items.append({"descripcion": it, "cantidad": 1, "unidad": "u", "precio_unitario": 0, "total_item": 0})
        if not items:
            return
        try:
            wa = sh.worksheet("Artículos")
        except:
            wa = sh.add_worksheet("Artículos", rows=2000, cols=9)
            wa.append_row(["Artículo","Proveedor","Unidad","Último Precio Unit.","Última Fecha","Comprobante","Local","Categoría","Veces Visto"])

        all_values = wa.get_all_values()
        header_row_idx = 0
        for idx, row in enumerate(all_values):
            if "Artículo" in row or "Articulo" in row:
                header_row_idx = idx
                break
        data_rows = all_values[header_row_idx + 1:]
        import re as _re2
        def norm_art(s):
            s = str(s).upper().strip()
            s = _re2.sub(r'\s+', ' ', s).strip()
            return s

        index = {}
        index_norm = {}
        for i, row in enumerate(data_rows):
            if not any(row): continue
            art = row[0].strip().upper() if len(row) > 0 else ""
            prov = row[1].strip().upper() if len(row) > 1 else ""
            if art:
                veces = int(row[8]) if len(row) > 8 and row[8].isdigit() else 1
                index[(art, prov)] = {"row": header_row_idx + 2 + i, "veces": veces}
                index_norm[(norm_art(art), norm_art(prov))] = (art, prov)

        for it in items:
            if not isinstance(it, dict): continue
            desc = str(it.get("descripcion","")).strip()
            if not desc: continue
            unidad = str(it.get("unidad","") or "")
            precio_unit = it.get("precio_unitario", 0) or 0
            prov_up = datos.get("proveedor","").upper()
            key = (desc.upper(), prov_up)
            if key not in index:
                norm_k = (norm_art(desc), norm_art(prov_up))
                if norm_k in index_norm:
                    key = index_norm[norm_k]
            if key in index:
                row_num = index[key]["row"]
                veces = index[key]["veces"] + 1
                wa.update(values=[[precio_unit, datos.get("fecha",""), comprobante, datos.get("local",""), datos.get("categoria",""), veces]], range_name=f"D{row_num}:I{row_num}")
            else:
                wa.append_row([desc, datos.get("proveedor",""), unidad, precio_unit, datos.get("fecha",""), comprobante, datos.get("local",""), datos.get("categoria",""), 1])
                index[key] = {"row": 9999, "veces": 1}

    except Exception as e:
        log.warning(f"No se pudo guardar en Sheets: {e}")

def corregir_en_sheet(nro_factura: str, proveedor: str, campo: str, valor, fecha: str = None, sheet_row: int = None):
    try:
        gc, sh = get_sheets_client()
        if not sh:
            return False, "Sin credenciales"
        ws = sh.worksheet(SHEETS_TAB)
        all_values = ws.get_all_values()
        header_idx = 0
        for i, row in enumerate(all_values):
            if "Proveedor" in row or "Fecha FC" in row:
                header_idx = i
                break
        headers = all_values[header_idx]

        CAMPO_COLUMNA = {
            "local":       "Local",
            "categoria":   "Categoría",
            "estado_pago": "Estado",
            "tipo_doc":    "Tipo Doc",
            "proveedor":   "Proveedor",
            "total":       "Total",
        }
        col_name = CAMPO_COLUMNA.get(campo)
        if not col_name:
            return False, f"Campo desconocido: {campo}"

        try:
            col_target  = headers.index(col_name) + 1
            col_prov    = headers.index("Proveedor") + 1
            col_factura = headers.index("# Factura") + 1
            col_fecha   = headers.index("Fecha FC") + 1
        except ValueError as e:
            return False, f"Columna no encontrada: {e}"

        if sheet_row:
            ws.update_cell(sheet_row, col_target, str(valor))
            log.info(f"✅ Sheet fila {sheet_row}: {col_name} = {valor}")
            return True, "OK"

        if nro_factura:
            for i, row in enumerate(all_values[header_idx+1:], start=header_idx+2):
                prov_cell = row[col_prov-1] if len(row) >= col_prov else ""
                fac_cell  = row[col_factura-1] if len(row) >= col_factura else ""
                if (proveedor.lower() in prov_cell.lower()) and (nro_factura in fac_cell or fac_cell in nro_factura):
                    ws.update_cell(i, col_target, str(valor))
                    return True, f"Fila {i} OK"

        for i, row in enumerate(all_values[header_idx+1:], start=header_idx+2):
            prov_cell  = row[col_prov-1]  if len(row) >= col_prov  else ""
            fecha_cell = row[col_fecha-1] if len(row) >= col_fecha else ""
            if proveedor.lower() in prov_cell.lower():
                if not fecha or fecha_cell == fecha:
                    ws.update_cell(i, col_target, str(valor))
                    return True, f"Fila {i} OK"

        return False, "Factura no encontrada"
    except Exception as e:
        log.error(f"corregir_en_sheet error: {e}")
        return False, str(e)

def esc(t) -> str:
    if t is None: return "-"
    s = str(t)
    for c in ["*", "_", "`", "["]:
        s = s.replace(c, "\\" + c)
    return s

def formatear_respuesta(d: dict) -> str:
    estado_pago = d.get("condicion_pago", "")
    pagada_txt = "✅ Pagado" if es_estado_pagado(estado_pago) else "⏳ Pendiente de pago"
    total = d.get("total", 0) or 0
    subtotal = d.get("subtotal", 0) or 0
    iva_21 = d.get("iva_21", 0) or 0
    iva_105 = d.get("iva_105", 0) or 0
    cat = esc(d.get("categoria", "Sin categorizar"))
    tipo = esc(d.get("tipo", "Comprobante"))
    alerta = "\n⚠️ *ATENCIÓN:* Transacción marcada como no operativa." if "EXCLUIR" in cat else ""
    iva_txt = ""
    if subtotal > 0: iva_txt += f"\n💵 *Neto:* ${subtotal:,.2f}"
    iva_27 = d.get("iva_27", 0) or 0
    percep_iibb = d.get("percep_iibb", 0) or 0
    percep_iva = d.get("percep_iva", 0) or 0
    if iva_21 > 0:       iva_txt += f"\n  • IVA 21%: ${iva_21:,.2f}"
    if iva_105 > 0:      iva_txt += f"\n  • IVA 10.5%: ${iva_105:,.2f}"
    if iva_27 > 0:       iva_txt += f"\n  • IVA 27%: ${iva_27:,.2f}"
    if percep_iibb > 0:  iva_txt += f"\n  • Percep. IIBB: ${percep_iibb:,.2f}"
    if percep_iva > 0:   iva_txt += f"\n  • Percep. IVA: ${percep_iva:,.2f}"
    cajero_txt = f"\n👤 *Cajero:* {esc(d.get('cajero'))}" if d.get("cajero") else ""
    items_raw = d.get("items", [])
    if isinstance(items_raw, dict):
        items_raw = list(items_raw.values())
    items_txt = ""
    if items_raw:
        lines = []
        for it in items_raw:
            if not isinstance(it, dict): continue
            desc  = str(it.get("descripcion","")).strip()
            if not desc: continue
            cant  = it.get("cantidad","")
            unid  = it.get("unidad","") or ""
            precio = it.get("precio_unitario", 0) or 0
            total_it = it.get("total_item", 0) or 0
            cant_txt = f"{cant}{unid}" if cant else ""
            if precio > 0 and cant:
                lines.append(f"  • {esc(desc[:40])} — {cant_txt} × ${precio:,.0f} = ${total_it:,.0f}")
            elif total_it > 0:
                lines.append(f"  • {esc(desc[:40])} — ${total_it:,.0f}")
            else:
                lines.append(f"  • {esc(desc[:40])}")
        if lines:
            items_txt = "\n\n📦 *Ítems:*\n" + "\n".join(lines)

    return (
        f"✅ *{tipo} procesado*\n\n"
        f"🏢 *Proveedor:* {esc(d.get('proveedor','?'))}\n"
        f"📄 *Comprobante:* {esc(d.get('numero_comprobante','-'))}\n"
        f"📅 *Fecha:* {esc(d.get('fecha','?'))}\n"
        f"💰 *Total:* ${total:,.2f}"
        f"{iva_txt}\n"
        f"🏷️ *Categoría:* {cat}\n"
        f"📍 *Local:* {esc(d.get('local','?'))}"
        f"{cajero_txt}\n"
        f"💳 *Estado:* {esc(estado_pago)} — {pagada_txt}"
        f"{items_txt}"
        f"{alerta}"
    )


async def pedir_item_a_corregir(update, context, info: dict):
    items = info.get("ultima_factura", {}).get("items", [])
    if not items:
        markup = ReplyKeyboardMarkup(
            [["➕ Agregar ítem"], ["❌ Cancelar"]],
            one_time_keyboard=True, resize_keyboard=True
        )
        info["paso"] = "agregando_item_desc"
        await update.message.reply_text(
            "Esta factura no tiene ítems guardados.\n\n"
            "¿Querés agregar uno?",
            reply_markup=markup
        )
        return
    info["paso"] = "corrigiendo_item_cual"
    opciones = []
    for i, it in enumerate(items[:10]):
        desc = str(it.get("descripcion","?"))[:25]
        cant = it.get("cantidad","")
        unid = it.get("unidad","")
        precio = it.get("precio_unitario",0)
        opciones.append([f"{i+1}. {desc} | {cant}{unid} | ${float(precio):,.0f}"])
    opciones.append(["❌ Cancelar"])
    markup = ReplyKeyboardMarkup(opciones, one_time_keyboard=True, resize_keyboard=True)
    await update.message.reply_text("📦 ¿Qué ítem querés corregir?", reply_markup=markup)

async def notificar_carga(bot, datos: dict, cargado_por: str, loader_chat_id: int = None):
    if not NOTIFY_IDS:
        return
    total = datos.get("total", 0) or 0
    proveedor = datos.get("proveedor", "?")
    local = datos.get("local", "?")
    estado = datos.get("condicion_pago", "")
    estado_icon = "✅" if es_estado_pagado(estado) else "⏳"
    msg = (
        f"📥 *Nueva factura cargada*\n\n"
        f"🏢 *{esc(proveedor)}*\n"
        f"💰 ${total:,.0f}\n"
        f"📍 {esc(local)}\n"
        f"👤 Cargada por {esc(cargado_por)}\n"
        f"{estado_icon} {esc(estado)}"
    )
    for chat_id in NOTIFY_IDS:
        if loader_chat_id and chat_id == loader_chat_id:
            continue
        try:
            await bot.send_message(chat_id=chat_id, text=msg, parse_mode="Markdown")
        except Exception as e:
            log.warning(f"No se pudo notificar a {chat_id}: {e}")

async def pedir_tipo_comprobante(update, context):
    markup = ReplyKeyboardMarkup([[t] for t in TIPOS_COMPROBANTE] + [["❌ Cancelar"]], one_time_keyboard=True, resize_keyboard=True)
    await update.message.reply_text("📋 ¿Qué tipo de comprobante es?", reply_markup=markup)

async def pedir_local(update, context):
    markup = ReplyKeyboardMarkup([[l] for l in LOCALES] + [["❌ Cancelar"]], one_time_keyboard=True, resize_keyboard=True)
    await update.message.reply_text("📍 ¿De qué local es este comprobante?", reply_markup=markup)

async def pedir_nombre(update, context):
    markup = ReplyKeyboardMarkup([["❌ Cancelar"]], resize_keyboard=True, one_time_keyboard=False)
    await update.message.reply_text("👤 ¿Cuál es tu nombre?", reply_markup=markup)

async def pedir_categoria(update, context, sugerida=None):
    markup = ReplyKeyboardMarkup([[c] for c in CATEGORIAS] + [["❌ Cancelar"]], one_time_keyboard=True, resize_keyboard=True)
    msg = "🏷️ ¿A qué categoría pertenece este gasto?"
    if sugerida:
        msg += f"\n_(Sugerida: {sugerida})_"
    await update.message.reply_text(msg, reply_markup=markup, parse_mode="Markdown")

async def pedir_estado_pago(update, context):
    markup = ReplyKeyboardMarkup([[e] for e in ESTADOS_PAGO] + [["❌ Cancelar"]], one_time_keyboard=True, resize_keyboard=True)
    await update.message.reply_text("💳 ¿Cuál es el estado del pago?", reply_markup=markup)

async def pedir_tipo_doc(update, context):
    markup = ReplyKeyboardMarkup([[t] for t in TIPOS_DOC] + [["❌ Cancelar"]], one_time_keyboard=True, resize_keyboard=True)
    await update.message.reply_text("📄 ¿Qué tipo de comprobante es?", reply_markup=markup)

async def pedir_texto_pago(update, context):
    markup = ReplyKeyboardMarkup([["❌ Cancelar"]], resize_keyboard=True, one_time_keyboard=False)
    await update.message.reply_text(
        "✏️ Escribí los datos del pago:\n\nEjemplo: _Pagué $15.000 en efectivo a García por reparación de heladera el 14/03/2026_",
        reply_markup=markup, parse_mode="Markdown"
    )

async def pedir_que_corregir(update, context):
    markup = ReplyKeyboardMarkup(
        [[c] for c in CAMPOS_CORREGIBLES] + [["✅ Listo, está bien"]],
        one_time_keyboard=True, resize_keyboard=True
    )
    await update.message.reply_text("✏️ ¿Qué querés corregir?", reply_markup=markup)

async def cmd_start(update, context):
    markup = ReplyKeyboardMarkup(
        [["💸 Cargar pago manual", "✏️ Corregir factura"]],
        resize_keyboard=True,
        one_time_keyboard=False,
        input_field_placeholder="Mandame una foto o PDF de la factura…"
    )
    await update.message.reply_text(
        "🥐 *Bienvenido a Lharmonie*\n\n"
        "Sistema de registro de facturas, remitos y pagos.\n\n"
        "📄 Mandame una *foto o PDF* de la factura o remito\n"
        "💸 Pago manual · ✏️ Corregir factura",
        parse_mode="Markdown",
        reply_markup=markup
    )

async def cmd_help(update, context):
    await update.message.reply_text(
        "📖 *Comandos:*\n\n"
        "/start — Bienvenida\n"
        "/pago — Cargar pago manual\n"
        "/corregir — Corregir la última factura cargada",
        parse_mode="Markdown"
    )

async def cmd_ultimas(update, context):
    if not Path(LOG_FILE).exists():
        await update.message.reply_text("Todavía no hay comprobantes procesados.")
        return
    with open(LOG_FILE, "r", encoding="utf-8") as f:
        registros = json.load(f)
    if not registros:
        await update.message.reply_text("Todavía no hay comprobantes procesados.")
        return
    ultimas = registros[-5:][::-1]
    msg = "📋 *Últimas cargas:*\n\n"
    for r in ultimas:
        cajero = f" ({r.get('cajero','')})" if r.get("cajero") else ""
        msg += f"• *{r.get('proveedor','?')}* — ${r.get('total',0):,.0f} — {r.get('fecha','?')} — {r.get('local','?')}{cajero}\n"
    await update.message.reply_text(msg, parse_mode="Markdown")

async def cmd_pago(update, context):
    chat_id = update.effective_chat.id
    estado_usuario[chat_id] = {"tipo_comprobante": "💸 Pago manual", "paso": "esperando_local_pago"}
    await pedir_local(update, context)

async def cmd_corregir_elegir(update, context):
    chat_id = update.effective_chat.id
    ultimas = []

    try:
        gc, sh = get_sheets_client()
        if sh:
            ws = sh.worksheet(SHEETS_TAB)
            all_values = ws.get_all_values()
            header_idx = 0
            for i, row in enumerate(all_values):
                if "Proveedor" in row or "Fecha FC" in row:
                    header_idx = i
                    break
            headers = all_values[header_idx]
            try:
                col_proveedor = headers.index("Proveedor")
                col_fecha     = headers.index("Fecha FC")
                col_total     = headers.index("Total")
                col_nro       = headers.index("# Factura")
                col_estado    = headers.index("Estado")
                col_cajero    = headers.index("Cajero")
            except ValueError:
                col_proveedor = col_fecha = col_total = col_nro = col_estado = col_cajero = -1

            data_rows = all_values[header_idx+1:]
            for row in reversed(data_rows):
                if not any(row): continue
                def gcol(col):
                    return row[col] if col >= 0 and col < len(row) else ""
                r = {
                    "proveedor":           gcol(col_proveedor),
                    "fecha":               gcol(col_fecha),
                    "total":               gcol(col_total),
                    "numero_comprobante":  gcol(col_nro),
                    "estado":              gcol(col_estado),
                    "cajero":              gcol(col_cajero),
                    "_sheet_row":          data_rows.index(row) + header_idx + 2,
                }
                if r["proveedor"]:
                    ultimas.append(r)
                if len(ultimas) >= 5:
                    break
    except Exception as e:
        log.warning(f"Error buscando en Sheet: {e}")

    if not ultimas and Path(LOG_FILE).exists():
        try:
            with open(LOG_FILE, "r", encoding="utf-8") as f:
                registros = json.load(f)
            for r in reversed(registros):
                ultimas.append(r)
                if len(ultimas) >= 5:
                    break
        except:
            pass

    if not ultimas:
        markup = ReplyKeyboardMarkup(
            [["💸 Cargar pago manual", "✏️ Corregir factura"]],
            resize_keyboard=True, one_time_keyboard=False
        )
        await update.message.reply_text("No encontré facturas recientes.", reply_markup=markup)
        return

    opciones = []
    for i, r in enumerate(ultimas):
        prov  = str(r.get("proveedor","?"))[:18]
        try:
            total = float(str(r.get("total","0")).replace("$","").replace(".","").replace(",",".").strip() or 0)
        except:
            total = 0
        fecha  = r.get("fecha","")
        cajero = r.get("cajero","")
        cajero_txt = f" · {cajero[:10]}" if cajero else ""
        opciones.append([f"{i+1}. {prov} — ${total:,.0f} {fecha}{cajero_txt}"])
    opciones.append(["❌ Cancelar"])
    markup = ReplyKeyboardMarkup(opciones, one_time_keyboard=True, resize_keyboard=True)
    estado_usuario[chat_id] = {"paso": "eligiendo_factura_corregir", "ultimas": ultimas}
    await update.message.reply_text("✏️ ¿Qué factura querés corregir?", reply_markup=markup)

async def cmd_corregir(update, context):
    chat_id = update.effective_chat.id
    registros = []
    if Path(LOG_FILE).exists():
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            try:
                registros = json.load(f)
            except:
                registros = []

    ultimas = [r for r in reversed(registros) if r.get("proveedor")][:8]

    if not ultimas:
        await update.message.reply_text("No encontré facturas cargadas recientemente.", reply_markup=ReplyKeyboardRemove())
        return

    estado_usuario[chat_id] = {
        "paso": "eligiendo_factura",
        "lista_facturas": ultimas,
    }

    opciones = []
    for i, r in enumerate(ultimas):
        prov = str(r.get("proveedor","?"))[:20]
        fecha = r.get("fecha","-")
        total = r.get("total",0) or 0
        cajero = f" ({r.get('cajero','')})" if r.get("cajero") else ""
        opciones.append([f"{i+1}. {prov} | {fecha} | ${total:,.0f}{cajero}"])
    opciones.append(["❌ Cancelar"])

    markup = ReplyKeyboardMarkup(opciones, one_time_keyboard=True, resize_keyboard=True)
    await update.message.reply_text("✏️ ¿Qué factura querés corregir?", reply_markup=markup)

async def handle_foto(update, context):
    chat_id = update.effective_chat.id
    photo = update.message.photo[-1]
    estado_usuario[chat_id] = {"file_id": photo.file_id, "file_type": "foto", "paso": "esperando_tipo"}
    await pedir_tipo_comprobante(update, context)

async def handle_documento(update, context):
    chat_id = update.effective_chat.id
    doc = update.message.document
    if doc.mime_type not in ["application/pdf", "image/jpeg", "image/png"]:
        await update.message.reply_text("⚠️ Solo acepto PDFs e imágenes (JPG/PNG).")
        return
    file_type = "pdf" if "pdf" in doc.mime_type else "foto"
    estado_usuario[chat_id] = {"file_id": doc.file_id, "file_type": file_type, "paso": "esperando_tipo"}
    await pedir_tipo_comprobante(update, context)

async def handle_texto(update, context):
    chat_id = update.effective_chat.id
    texto = update.message.text.strip()
    log.info(f"📨 Texto recibido: [{repr(texto)}] de chat_id={chat_id}")

    if "Cancelar" in texto or texto.lower() == "cancelar":
        estado_usuario.pop(chat_id, None)
        markup = ReplyKeyboardMarkup(
            [["💸 Cargar pago manual", "✏️ Corregir factura"]],
            resize_keyboard=True, one_time_keyboard=False
        )
        await update.message.reply_text("Cancelado.", reply_markup=markup)
        return

    if "Corregir factura" in texto:
        estado_usuario.pop(chat_id, None)
        await cmd_corregir_elegir(update, context)
        return

    if "pago manual" in texto.lower() or "Cargar pago" in texto:
        estado_usuario.pop(chat_id, None)
        await cmd_pago(update, context)
        return

    if chat_id not in estado_usuario:
        markup = ReplyKeyboardMarkup(
            [["💸 Cargar pago manual", "✏️ Corregir factura"]],
            resize_keyboard=True, one_time_keyboard=False,
            input_field_placeholder="Mandame una foto o PDF…"
        )
        await update.message.reply_text(
            "👋 Mandame una *foto o PDF* de la factura o remito.",
            parse_mode="Markdown",
            reply_markup=markup
        )
        return

    info = estado_usuario[chat_id]
    paso = info.get("paso", "")

    # ── FLUJO DE CORRECCIÓN ──────────────────────────────────────────
    if paso == "eligiendo_factura":
        lista = info.get("lista_facturas", [])
        try:
            idx = int(texto.split(".")[0]) - 1
            if 0 <= idx < len(lista):
                factura = lista[idx]
                estado_usuario[chat_id] = {
                    "paso": "corrigiendo_que",
                    "ultima_factura": factura,
                }
                proveedor = factura.get("proveedor","?")
                nro = factura.get("numero_comprobante","-")
                fecha = factura.get("fecha","-")
                await update.message.reply_text(
                    f"✏️ Corrigiendo: *{esc(proveedor)}*\nNº {esc(nro)} · {fecha}\n\n¿Qué querés cambiar?",
                    parse_mode="Markdown"
                )
                await pedir_que_corregir(update, context)
            else:
                await update.message.reply_text("Número inválido, elegí de la lista.")
        except:
            await update.message.reply_text("Elegí un número de la lista.")
        return

    if paso == "corrigiendo_que":
        if texto == "✅ Listo, está bien":
            estado_usuario.pop(chat_id, None)
            await update.message.reply_text("✅ Todo bien, sin cambios.", reply_markup=ReplyKeyboardRemove())
            return
        if texto not in CAMPOS_CORREGIBLES:
            await update.message.reply_text("Por favor elegí una opción de la lista.")
            return
        info["campo_a_corregir"] = CAMPO_KEY[texto]
        info["paso"] = "corrigiendo_valor"
        if texto == "📍 Local":
            await pedir_local(update, context)
        elif texto == "🏷️ Categoría":
            await pedir_categoria(update, context)
        elif texto == "💳 Estado de pago":
            await pedir_estado_pago(update, context)
        elif texto == "📄 Tipo de comprobante":
            await pedir_tipo_doc(update, context)
        elif texto == "🏢 Proveedor":
            await update.message.reply_text(
                f"🏢 Proveedor actual: *{esc(info.get('ultima_factura', {}).get('proveedor', '?'))}*\n\nEscribí el nombre correcto del proveedor:",
                parse_mode="Markdown", reply_markup=ReplyKeyboardRemove()
            )
        elif texto == "📦 Ítems (precio/cantidad)":
            await pedir_item_a_corregir(update, context, info)
        elif "Modificar total" in texto:
            total_raw = info.get("ultima_factura", {}).get("total", 0) or 0
            try:
                total_actual = float(str(total_raw).replace("$","").replace(".","").replace(",",".").strip())
            except:
                total_actual = 0
            info["paso"] = "modificando_total"
            await update.message.reply_text(
                f"💰 Total actual: *${total_actual:,.0f}*\n\nEscribí el nuevo total (solo números):",
                parse_mode="Markdown", reply_markup=ReplyKeyboardRemove()
            )
        return

    if paso == "confirmando_total_remito":
        datos = info.get("ultima_factura", {})
        afirmativos = ("si", "sí", "ok", "correcto", "esta bien", "está bien", "bien", "si esta bien", "sí está bien", "yes", "✅", "todo bien", "listo")
        if texto.lower().strip() in afirmativos or texto.lower().startswith("si") or texto.lower().startswith("sí"):
            guardar_local(datos)
            volcar_sheets(datos)
            await notificar_carga(context.bot, datos, datos.get("cajero","?"), loader_chat_id=update.effective_chat.id)
            markup = ReplyKeyboardMarkup([["✅ Todo bien"], ["✏️ Corregir algo"]], one_time_keyboard=True, resize_keyboard=True)
            await update.message.reply_text("¿Algo más para corregir?", reply_markup=markup)
            estado_usuario[chat_id] = {"paso": "esperando_confirmacion", "ultima_factura": datos}
        else:
            try:
                nuevo_total = float(texto.replace(".","").replace(",",".").replace("$","").strip())
                datos["total"] = nuevo_total
                datos["subtotal"] = nuevo_total
                guardar_local(datos)
                volcar_sheets(datos)
                await notificar_carga(context.bot, datos, datos.get("cajero","?"), loader_chat_id=update.effective_chat.id)
                markup = ReplyKeyboardMarkup([["✅ Todo bien"], ["✏️ Corregir algo"]], one_time_keyboard=True, resize_keyboard=True)
                await update.message.reply_text(
                    f"✅ Total actualizado a *${nuevo_total:,.0f}*\n\n¿Algo más para corregir?",
                    parse_mode="Markdown", reply_markup=markup
                )
                estado_usuario[chat_id] = {"paso": "esperando_confirmacion", "ultima_factura": datos}
            except ValueError:
                await update.message.reply_text(
                    "No entendí el monto. Escribí solo el número, por ejemplo: 30000"
                )
        return

    if paso == "eligiendo_factura_corregir":
        ultimas = info.get("ultimas", [])
        try:
            idx = int(texto.split(".")[0]) - 1
            if 0 <= idx < len(ultimas):
                factura = ultimas[idx]
                estado_usuario[chat_id] = {"paso": "corrigiendo_que", "ultima_factura": factura}
                proveedor = factura.get("proveedor","?")
                nro = factura.get("numero_comprobante","-")
                fecha = factura.get("fecha","")
                await update.message.reply_text(
                    f"✏️ Corrigiendo: *{esc(proveedor)}*\nNº {esc(nro)} · {esc(fecha)}\n\n¿Qué querés cambiar?",
                    parse_mode="Markdown"
                )
                await pedir_que_corregir(update, context)
            else:
                await update.message.reply_text("Elegí un número de la lista.")
        except:
            await update.message.reply_text("Elegí un número de la lista.")
        return

    if paso == "modificando_total":
        try:
            nuevo_total = float(texto.replace(".","").replace(",",".").replace("$","").strip())
            datos = info.get("ultima_factura", {})
            datos["total"] = nuevo_total
            datos["subtotal"] = nuevo_total
            nro = datos.get("numero_comprobante","")
            if "-" in nro:
                nro_factura = nro.split("-",1)[1].lstrip("0") or "0"
            else:
                nro_factura = nro
            ok, msg_sheet = corregir_en_sheet(nro_factura, datos.get("proveedor",""), "total", nuevo_total, fecha=datos.get("fecha",""), sheet_row=datos.get("_sheet_row"))
            if ok:
                await update.message.reply_text(
                    f"✅ Total actualizado a *${nuevo_total:,.0f}*",
                    parse_mode="Markdown", reply_markup=ReplyKeyboardRemove()
                )
            else:
                await update.message.reply_text(
                    f"✅ Total guardado localmente: *${nuevo_total:,.0f}*\n⚠️ No se pudo actualizar en Sheet: {msg_sheet}",
                    parse_mode="Markdown", reply_markup=ReplyKeyboardRemove()
                )
        except ValueError:
            await update.message.reply_text("Número inválido. Escribí solo el monto, por ejemplo: 45000")
            return
        info["paso"] = "corrigiendo_que"
        await pedir_que_corregir(update, context)
        return

    if paso == "agregando_item_desc":
        if "Cancelar" in texto:
            info["paso"] = "corrigiendo_que"
            await pedir_que_corregir(update, context)
            return
        if "Agregar" in texto:
            await update.message.reply_text("Escribí la descripción del ítem:", reply_markup=ReplyKeyboardRemove())
            return
        info["nuevo_item"] = {"descripcion": texto, "cantidad": 1, "unidad": "u", "precio_unitario": 0, "total_item": 0}
        info["paso"] = "agregando_item_precio"
        await update.message.reply_text("💲 ¿Cuál es el precio unitario?")
        return

    if paso == "agregando_item_precio":
        try:
            precio = float(texto.replace(".","").replace(",",".").replace("$","").strip())
            item = info.get("nuevo_item", {})
            item["precio_unitario"] = precio
            item["total_item"] = precio
            if "items" not in info.get("ultima_factura", {}):
                info["ultima_factura"]["items"] = []
            info["ultima_factura"]["items"].append(item)
            await update.message.reply_text(
                f"✅ Ítem agregado: *{esc(item['descripcion'])}* — ${precio:,.0f}",
                parse_mode="Markdown"
            )
        except:
            await update.message.reply_text("Precio inválido, ingresá solo el número.")
        info["paso"] = "corrigiendo_que"
        await pedir_que_corregir(update, context)
        return

    if paso == "corrigiendo_item_cual":
        items = info.get("ultima_factura", {}).get("items", [])
        try:
            idx = int(texto.split(".")[0]) - 1
            if 0 <= idx < len(items):
                info["item_idx"] = idx
                info["paso"] = "corrigiendo_item_campo"
                markup = ReplyKeyboardMarkup(
                    [["✏️ Descripción"], ["📏 Cantidad"], ["💲 Precio unitario"], ["❌ Cancelar"]],
                    one_time_keyboard=True, resize_keyboard=True
                )
                item = items[idx]
                await update.message.reply_text(
                    f"Item: *{esc(str(item.get('descripcion','?'))[:40])}*\n"
                    f"Cantidad: {item.get('cantidad','?')} {item.get('unidad','')}\n"
                    f"Precio unit: ${item.get('precio_unitario',0):,.2f}\n\n"
                    f"¿Qué querés corregir?",
                    parse_mode="Markdown", reply_markup=markup
                )
            else:
                await update.message.reply_text("Número inválido, intentá de nuevo.")
        except:
            await update.message.reply_text("Elegí un número de la lista.")
        return

    if paso == "corrigiendo_item_campo":
        campo_item = texto
        if campo_item == "❌ Cancelar":
            info["paso"] = "corrigiendo_que"
            await pedir_que_corregir(update, context)
            return
        info["campo_item"] = campo_item
        info["paso"] = "corrigiendo_item_valor"
        labels = {"✏️ Descripción": "la nueva descripción", "📏 Cantidad": "la nueva cantidad (número)", "💲 Precio unitario": "el nuevo precio unitario (número)"}
        await update.message.reply_text(
            f"Escribí {labels.get(campo_item, 'el nuevo valor')}:",
            reply_markup=ReplyKeyboardRemove()
        )
        return

    if paso == "corrigiendo_item_valor":
        items = info.get("ultima_factura", {}).get("items", [])
        idx = info.get("item_idx", 0)
        campo_item = info.get("campo_item", "")
        if idx < len(items):
            item = items[idx]
            campo_map = {"✏️ Descripción": "descripcion", "📏 Cantidad": "cantidad", "💲 Precio unitario": "precio_unitario"}
            campo_real = campo_map.get(campo_item, "descripcion")
            try:
                if campo_real in ("cantidad", "precio_unitario"):
                    valor = float(texto.replace(",",".").replace("$","").strip())
                else:
                    valor = texto.strip()
                items[idx][campo_real] = valor
                if campo_real in ("cantidad", "precio_unitario"):
                    items[idx]["total_item"] = round(
                        float(items[idx].get("cantidad",1) or 1) *
                        float(items[idx].get("precio_unitario",0) or 0), 2
                    )
                await update.message.reply_text(
                    f"✅ Item actualizado: *{esc(str(items[idx].get('descripcion',''))[:30])}* — "
                    f"{items[idx].get('cantidad','')} {items[idx].get('unidad','')} × "
                    f"${float(items[idx].get('precio_unitario',0)):,.2f}",
                    parse_mode="Markdown", reply_markup=ReplyKeyboardRemove()
                )
            except ValueError:
                await update.message.reply_text("Valor inválido, ingresá un número.", reply_markup=ReplyKeyboardRemove())
        info["paso"] = "corrigiendo_que"
        await pedir_que_corregir(update, context)
        return

    if paso == "corrigiendo_valor":
        campo = info.get("campo_a_corregir","")
        ultima = info.get("ultima_factura", {})

        opciones_validas = {
            "local": LOCALES,
            "categoria": CATEGORIAS,
            "estado_pago": ESTADOS_PAGO,
            "tipo_doc": TIPOS_DOC,
        }
        if campo == "proveedor":
            proveedor_nuevo = texto
            nro = ultima.get("numero_comprobante","")
            if "-" in nro:
                nro_factura = nro.split("-",1)[1].lstrip("0") or "0"
            else:
                nro_factura = nro
            ok, msg_sheet = corregir_en_sheet(nro_factura, ultima.get("proveedor",""), "proveedor", proveedor_nuevo, fecha=ultima.get("fecha",""), sheet_row=ultima.get("_sheet_row"))
            if ok:
                info["ultima_factura"]["proveedor"] = proveedor_nuevo
                if Path(LOG_FILE).exists():
                    with open(LOG_FILE, "r", encoding="utf-8") as f:
                        registros = json.load(f)
                    for r in reversed(registros):
                        if str(r.get("chat_id","")) == str(chat_id) and r.get("numero_comprobante") == nro:
                            r["proveedor"] = proveedor_nuevo
                            break
                    with open(LOG_FILE, "w", encoding="utf-8") as f:
                        json.dump(registros, f, ensure_ascii=False, indent=2)
                await update.message.reply_text(
                    f"✅ Proveedor actualizado a: *{esc(proveedor_nuevo)}*",
                    parse_mode="Markdown", reply_markup=ReplyKeyboardRemove()
                )
            else:
                await update.message.reply_text(
                    f"⚠️ No pude actualizar en el Sheet: {msg_sheet}\nCambio guardado localmente.",
                    reply_markup=ReplyKeyboardRemove()
                )
            info["paso"] = "corrigiendo_que"
            await pedir_que_corregir(update, context)
            return

        if texto not in opciones_validas.get(campo, []):
            await update.message.reply_text("Por favor elegí una opción de la lista.")
            return

        proveedor = ultima.get("proveedor","")
        nro = ultima.get("numero_comprobante","")
        if "-" in nro:
            nro_factura = nro.split("-",1)[1].lstrip("0") or "0"
        else:
            nro_factura = nro

        ok, msg_sheet = corregir_en_sheet(nro_factura, proveedor, campo, texto)

        CAMPO_NOMBRE = {"local": "local", "categoria": "categoría", "estado_pago": "estado de pago", "tipo_doc": "tipo de comprobante"}
        if ok:
            if Path(LOG_FILE).exists():
                with open(LOG_FILE, "r", encoding="utf-8") as f:
                    registros = json.load(f)
                for r in reversed(registros):
                    if str(r.get("chat_id","")) == str(chat_id) and r.get("numero_comprobante") == nro:
                        r[campo] = texto
                        if campo == "estado_pago":
                            r["condicion_pago"] = texto
                            r["pagada"] = es_estado_pagado(texto)
                        break
                with open(LOG_FILE, "w", encoding="utf-8") as f:
                    json.dump(registros, f, ensure_ascii=False, indent=2)

            await update.message.reply_text(
                f"✅ {CAMPO_NOMBRE.get(campo,'Campo').capitalize()} actualizado a: *{esc(texto)}*",
                parse_mode="Markdown",
                reply_markup=ReplyKeyboardRemove()
            )
        else:
            await update.message.reply_text(
                f"⚠️ No pude actualizar en el Sheet: {msg_sheet}\n\nEl cambio se guardó localmente.",
                reply_markup=ReplyKeyboardRemove()
            )

        info["paso"] = "corrigiendo_que"
        await pedir_que_corregir(update, context)
        return

    # ── FLUJO NORMAL ────────────────────────────────────────────────
    if paso == "esperando_tipo":
        if texto not in TIPOS_COMPROBANTE:
            await update.message.reply_text("Por favor elegí una opción de la lista.")
            return
        info["tipo_comprobante"] = texto
        info["paso"] = "esperando_local"
        await pedir_local(update, context)
        return

    if paso in ("esperando_local", "esperando_local_pago"):
        if texto not in LOCALES:
            await update.message.reply_text("Por favor elegí un local de la lista.")
            return
        info["local"] = texto
        info["paso"] = "esperando_nombre" if paso == "esperando_local" else "esperando_nombre_pago"
        await pedir_nombre(update, context)
        return

    if paso in ("esperando_nombre", "esperando_nombre_pago"):
        info["cajero"] = texto
        if paso == "esperando_nombre_pago":
            info["paso"] = "esperando_texto_pago"
            await pedir_texto_pago(update, context)
        else:
            info["paso"] = "esperando_categoria"
            await pedir_categoria(update, context)
        return

    if paso == "esperando_texto_pago":
        info["texto_pago"] = texto
        info["paso"] = "esperando_categoria_pago"
        await pedir_categoria(update, context)
        return

    if paso in ("esperando_categoria", "esperando_categoria_pago"):
        if texto not in CATEGORIAS:
            await update.message.reply_text("Por favor elegí una categoría de la lista.")
            return
        info["categoria_elegida"] = texto
        info["paso"] = "esperando_pago" if paso == "esperando_categoria" else "esperando_pago_manual"
        await pedir_estado_pago(update, context)
        return

    if paso in ("esperando_pago", "esperando_pago_manual"):
        if texto not in ESTADOS_PAGO:
            await update.message.reply_text("Por favor elegí una opción de la lista.")
            return
        info["estado_pago"] = texto
        if paso == "esperando_pago_manual":
            await procesar_pago_manual(update, context, info)
        else:
            await procesar_archivo_con_info(update, context, info)
        return

    # ── CONFIRMACIÓN POST-CARGA ──────────────────────────────────────
    if paso == "esperando_confirmacion":
        if texto == "✅ Todo bien":
            estado_usuario.pop(chat_id, None)
            await update.message.reply_text("✅ Listo.", reply_markup=ReplyKeyboardRemove())
        elif texto == "✏️ Corregir algo":
            info["paso"] = "corrigiendo_que"
            await pedir_que_corregir(update, context)
        else:
            await update.message.reply_text("Por favor elegí una opción.")
        return

async def procesar_archivo_con_info(update, context, info: dict):
    global hubo_overload
    chat_id = update.effective_chat.id
    file_id = info.get("file_id","")
    if file_id and file_id in file_ids_procesados:
        log.warning(f"⚠️ file_id {file_id} ya procesado, ignorando duplicado")
        return
    if file_id:
        file_ids_procesados.add(file_id)
        if len(file_ids_procesados) > 200: file_ids_procesados.clear()
    msg = await update.message.reply_text("⏳ Procesando...", reply_markup=ReplyKeyboardRemove())
    try:
        file = await context.bot.get_file(info["file_id"])
        buf = io.BytesIO()
        await file.download_to_memory(buf)
        file_bytes = buf.getvalue()
        image_bytes = pdf_to_image(file_bytes) if info["file_type"] == "pdf" else file_bytes
        datos = await extraer_factura(image_bytes)
        datos["local"]        = info.get("local", "")
        datos["cajero"]       = info.get("cajero", "")
        datos["categoria"]    = info.get("categoria_elegida", categorizar_auto(datos.get("proveedor","")) or "❓ Otro")
        datos["procesado_en"] = datetime.now().strftime("%d/%m/%Y %H:%M")
        datos["chat_id"]      = str(chat_id)
        estado_pago = info.get("estado_pago", "")
        datos["condicion_pago"] = estado_pago
        datos["pagada"] = es_estado_pagado(estado_pago)
        if "Remito" in info.get("tipo_comprobante", ""):
            datos["tipo"] = "Remito"

        if not datos.get("fecha"):
            datos["fecha"] = datetime.now().strftime("%d/%m/%Y")
            log.info(f"📅 Fecha no detectada, usando hoy: {datos['fecha']}")

        # Subir imagen a Drive
        try:
            fecha_str = datos.get("fecha","").replace("/","-")
            prov_str  = str(datos.get("proveedor","")).replace(" ","_")[:20]
            nro_str   = str(datos.get("numero_comprobante","")).replace("/","-")
            filename  = f"{fecha_str}_{prov_str}_{nro_str}.jpg"
            log.info(f"📸 Subiendo imagen a Drive: {filename}")
            link = subir_imagen_drive(image_bytes, filename)
            if link:
                datos["imagen_link"] = link
                log.info(f"✅ Imagen guardada en Drive: {link}")
            else:
                log.warning("⚠️ subir_imagen_drive retornó None")
        except Exception as e:
            log.error(f"❌ Error subiendo imagen a Drive: {e}", exc_info=True)

        guardar_local(datos)
        volcar_sheets(datos)
        try:
            await msg.delete()
        except:
            pass
        await update.message.reply_text(formatear_respuesta(datos), parse_mode="Markdown")
        log.info(f"✅ {datos.get('tipo')} procesado: {datos.get('proveedor')} ${datos.get('total')}")

        tipo_doc = datos.get("tipo","").lower()
        es_remito = "remito" in tipo_doc or "Remito" in info.get("tipo_comprobante","")
        if es_remito:
            total_detectado = datos.get("total", 0) or 0
            estado_usuario[chat_id] = {"paso": "confirmando_total_remito", "ultima_factura": datos}
            await update.message.reply_text(
                f"📦 *Remito de {esc(datos.get('proveedor','?'))}*\n\n"
                f"💰 Total detectado: *${total_detectado:,.0f}*\n\n"
                f"¿Es correcto? Si no, escribí el monto real (solo números):",
                parse_mode="Markdown",
                reply_markup=ReplyKeyboardRemove()
            )
        else:
            await notificar_carga(context.bot, datos, datos.get("cajero", "?"), loader_chat_id=chat_id)
            if hubo_overload:
                hubo_overload = False
                for chat_id_notif in NOTIFY_IDS:
                    try:
                        await context.bot.send_message(
                            chat_id=chat_id_notif,
                            text="✅ *El sistema volvió a funcionar correctamente.*",
                            parse_mode="Markdown"
                        )
                    except: pass
            markup = ReplyKeyboardMarkup([["✅ Todo bien"], ["✏️ Corregir algo"]], one_time_keyboard=True, resize_keyboard=True)
            await update.message.reply_text("¿Los datos quedaron bien?", reply_markup=markup)
            estado_usuario[chat_id] = {"paso": "esperando_confirmacion", "ultima_factura": datos}

    except json.JSONDecodeError:
        await msg.edit_text("⚠️ No pude leer el comprobante. Intentá con foto más nítida.")
    except Exception as e:
        log.error(f"Error: {e}")
        es_overload = "529" in str(e) or "overloaded" in str(e).lower()
        if es_overload:
            try:
                await msg.edit_text(
                    "⏳ *El sistema de IA está con mucho tráfico ahora.*\n\n"
                    "No pudimos subir tu factura — intentalo de nuevo en unos minutos.",
                    parse_mode="Markdown"
                )
            except:
                await update.message.reply_text(
                    "⏳ *El sistema de IA está con mucho tráfico ahora.*\n\n"
                    "No pudimos subir tu factura — intentalo de nuevo en unos minutos.",
                    parse_mode="Markdown"
                )
            hubo_overload = True
            for chat_id_notif in NOTIFY_IDS:
                try:
                    await context.bot.send_message(
                        chat_id=chat_id_notif,
                        text=f"⚠️ *API Anthropic sobrecargada*\n\nUn usuario intentó cargar una factura y la API respondió 529 Overloaded.\nPuede que haya más intentos fallidos en los próximos minutos.",
                        parse_mode="Markdown"
                    )
                except: pass
        else:
            try:
                await msg.edit_text(f"❌ Error al procesar.\n`{str(e)[:100]}`", parse_mode="Markdown")
            except:
                await update.message.reply_text("❌ Error al procesar. Intentá de nuevo.")

async def procesar_pago_manual(update, context, info: dict):
    global hubo_overload
    chat_id = update.effective_chat.id
    msg = await update.message.reply_text("⏳ Procesando...", reply_markup=ReplyKeyboardRemove())
    try:
        datos = await extraer_pago_manual(info.get("texto_pago", ""))
        datos["local"]        = info.get("local", "")
        datos["cajero"]       = info.get("cajero", "")
        cat_sug2 = datos.pop("categoria_sugerida", None)
        datos["categoria"]    = info.get("categoria_elegida", cat_sug2 or "❓ Otro")
        datos["procesado_en"] = datetime.now().strftime("%d/%m/%Y %H:%M")
        datos["chat_id"]      = str(chat_id)
        datos["subtotal"]     = datos.get("total", 0)
        estado_pago = info.get("estado_pago", "")
        datos["condicion_pago"] = estado_pago
        datos["pagada"] = es_estado_pagado(estado_pago)
        guardar_local(datos)
        volcar_sheets(datos)
        try:
            await msg.delete()
        except:
            pass
        await update.message.reply_text(formatear_respuesta(datos), parse_mode="Markdown")
        log.info(f"✅ Pago manual: {datos.get('proveedor')} ${datos.get('total')}")

        tipo_doc = datos.get("tipo","").lower()
        es_remito = "remito" in tipo_doc or "Remito" in info.get("tipo_comprobante","")
        if es_remito:
            total_detectado = datos.get("total", 0) or 0
            estado_usuario[chat_id] = {"paso": "confirmando_total_remito", "ultima_factura": datos}
            await update.message.reply_text(
                f"📦 *Remito de {esc(datos.get('proveedor','?'))}*\n\n"
                f"💰 Total detectado: *${total_detectado:,.0f}*\n\n"
                f"¿Es correcto? Si no, escribí el monto real (solo números):",
                parse_mode="Markdown",
                reply_markup=ReplyKeyboardRemove()
            )
        else:
            await notificar_carga(context.bot, datos, datos.get("cajero", "?"), loader_chat_id=chat_id)
            if hubo_overload:
                hubo_overload = False
                for chat_id_notif in NOTIFY_IDS:
                    try:
                        await context.bot.send_message(
                            chat_id=chat_id_notif,
                            text="✅ *El sistema volvió a funcionar correctamente.*",
                            parse_mode="Markdown"
                        )
                    except: pass
            markup = ReplyKeyboardMarkup([["✅ Todo bien"], ["✏️ Corregir algo"]], one_time_keyboard=True, resize_keyboard=True)
            await update.message.reply_text("¿Los datos quedaron bien?", reply_markup=markup)
            estado_usuario[chat_id] = {"paso": "esperando_confirmacion", "ultima_factura": datos}

    except Exception as e:
        log.error(f"Error pago manual: {e}")
        es_overload = "529" in str(e) or "overloaded" in str(e).lower()
        if es_overload:
            try:
                await msg.edit_text(
                    "⏳ *El sistema de IA está con mucho tráfico ahora.*\n\n"
                    "No pudimos registrar tu pago — intentalo de nuevo en unos minutos.",
                    parse_mode="Markdown"
                )
            except:
                await update.message.reply_text(
                    "⏳ *El sistema de IA está con mucho tráfico ahora.*\n\n"
                    "No pudimos registrar tu pago — intentalo de nuevo en unos minutos.",
                    parse_mode="Markdown"
                )
            hubo_overload = True
            for chat_id_notif in NOTIFY_IDS:
                try:
                    await context.bot.send_message(
                        chat_id=chat_id_notif,
                        text=f"⚠️ *API Anthropic sobrecargada*\n\nUn usuario intentó cargar un pago manual y la API respondió 529 Overloaded.",
                        parse_mode="Markdown"
                    )
                except: pass
        else:
            try:
                await msg.edit_text(f"❌ Error.\n`{str(e)[:100]}`", parse_mode="Markdown")
            except:
                await update.message.reply_text("❌ Error al procesar.")

# ── API HTTP ──────────────────────────────────────────────────────────────────
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading

API_SECRET = os.environ.get("API_SECRET", "lharmonie2026")

def marcar_pagado_en_sheet(proveedor, numero_factura, fecha_pago, estado="✅ Pagado", fecha_factura="", fila_exacta=None):
    try:
        gc, sh = get_sheets_client()
        if not sh:
            return False, "Sin credenciales"
        ws = sh.worksheet("Facturas")
        all_values = ws.get_all_values()
        header_idx = 0
        for i, row in enumerate(all_values):
            if "Proveedor" in row or "Fecha FC" in row:
                header_idx = i
                break
        headers = all_values[header_idx]
        try:
            col_estado     = headers.index("Estado") + 1
            col_fecha_pago = headers.index("Fecha de Pago") + 1
        except ValueError as e:
            return False, f"Columna no encontrada: {e}"

        # Estrategia 1: fila exacta (más preciso, evita matchear duplicados)
        if fila_exacta:
            try:
                ws.update_cell(fila_exacta, col_estado, estado)
                ws.update_cell(fila_exacta, col_fecha_pago, fecha_pago)
                log.info(f"✅ Factura marcada pagada: fila exacta {fila_exacta} — {proveedor}")
                return True, f"Fila {fila_exacta} actualizada"
            except Exception as e:
                log.warning(f"⚠️ fila_exacta falló: {e} — intentando búsqueda")

        # Estrategia 2: buscar por proveedor + nro + fecha
        try:
            col_prov       = headers.index("Proveedor") + 1
            col_factura    = headers.index("# Factura") + 1
        except ValueError as e:
            return False, f"Columna no encontrada: {e}"
        try:
            col_fecha_fc = headers.index("Fecha FC") + 1
        except:
            col_fecha_fc = None

        for i, row in enumerate(all_values[header_idx+1:], start=header_idx+2):
            prov_cell  = row[col_prov-1]    if len(row) >= col_prov    else ""
            fac_cell   = row[col_factura-1] if len(row) >= col_factura else ""
            fecha_cell = row[col_fecha_fc-1] if col_fecha_fc and len(row) >= col_fecha_fc else ""
            estado_cell = row[col_estado-1] if len(row) >= col_estado else ""

            # No tocar facturas ya pagadas
            if "pagado" in estado_cell.lower() or "✅" in estado_cell:
                continue

            prov_match  = proveedor.lower() in prov_cell.lower() or prov_cell.lower() in proveedor.lower()
            nro_match   = not numero_factura or (numero_factura in fac_cell or fac_cell in numero_factura)
            fecha_match = not fecha_factura or not fecha_cell or fecha_cell == fecha_factura

            if prov_match and nro_match and fecha_match:
                ws.update_cell(i, col_estado, estado)
                ws.update_cell(i, col_fecha_pago, fecha_pago)
                log.info(f"✅ Factura marcada pagada: fila {i} — {proveedor}")
                return True, f"Fila {i} actualizada"

        return False, f"Factura no encontrada: {proveedor} / {numero_factura}"
    except Exception as e:
        return False, str(e)

class APIHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args): pass

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-secret")
        self.end_headers()

    def do_POST(self):
        if self.path in ("/marcar-pagado", "/update-estado"):
            auth  = self.headers.get("Authorization", "")
            secret = self.headers.get("x-api-secret", "")
            if auth != f"Bearer {API_SECRET}" and secret != API_SECRET:
                self.send_response(401)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(b'{"error": "Unauthorized"}')
                return
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body)
                proveedor      = data.get("proveedor", "")
                numero_factura = data.get("numero_factura","") or data.get("nroFactura","")
                fecha_pago     = data.get("fecha_pago","") or data.get("fechaPago", datetime.now().strftime("%d/%m/%Y"))
                fecha_factura  = data.get("fecha","") or data.get("fechaFactura","")
                estado         = data.get("estado","✅ Pagado")
                fila_exacta    = data.get("filaExacta") or data.get("fila_exacta")
                if fila_exacta:
                    try: fila_exacta = int(fila_exacta)
                    except: fila_exacta = None
                log.info(f"📥 POST /update-estado — proveedor={proveedor!r} nro={numero_factura!r} fila={fila_exacta} estado={estado!r}")
                ok, msg = marcar_pagado_en_sheet(proveedor, numero_factura, fecha_pago, estado, fecha_factura, fila_exacta)
                log.info(f"{'✅' if ok else '❌'} marcar_pagado resultado: ok={ok} msg={msg!r}")
                self.send_response(200 if ok else 400)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": ok, "message": msg}).encode())
            except Exception as e:
                log.error(f"❌ do_POST exception: {e}", exc_info=True)
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b'{"status": "ok"}')
        else:
            self.send_response(404)
            self.end_headers()

def start_api_server():
    port = int(os.environ.get("PORT", 8080))
    server = HTTPServer(("0.0.0.0", port), APIHandler)
    log.info(f"🌐 API server en puerto {port}")
    server.serve_forever()


def inicializar_usuarios_sheet():
    try:
        gc, sh = get_sheets_client()
        if not sh:
            return
        try:
            ws = sh.worksheet("Usuarios")
            log.info("✅ Pestaña Usuarios ya existe")
            return
        except:
            pass
        ws = sh.add_worksheet("Usuarios", rows=20, cols=4)
        ws.append_row(["usuario", "nombre", "rol", "password"])
        ws.append_row(["martin",  "Martín Masri", "Administrador", "0706"])
        ws.append_row(["melanie", "Melanie",       "Gestión",       "2607"])
        ws.append_row(["iara",    "Iara",           "Gestión",       "3611"])
        ws.format("A1:D1", {
            "backgroundColor": {"red": 0.102, "green": 0.063, "blue": 0.031},
            "textFormat": {"foregroundColor": {"red": 0.961, "green": 0.941, "blue": 0.910}, "bold": True},
            "horizontalAlignment": "CENTER"
        })
        ws.format("A2:D10", {
            "backgroundColor": {"red": 0.992, "green": 0.980, "blue": 0.957},
        })
        log.info("✅ Pestaña Usuarios creada con usuarios por defecto")
    except Exception as e:
        log.warning(f"No se pudo crear pestaña Usuarios: {e}")


async def cmd_testbistrosoft(update, context):
    """
    Comando /testbistrosoft — muestra los tipos de transacción reales de Bistrosoft.
    Uso: /testbistrosoft            → usa fecha de hoy
         /testbistrosoft 16/03/2026 → usa esa fecha
    Solo para Martín.
    """
    chat_id = update.effective_chat.id
    if chat_id != 6457094702:
        await update.message.reply_text("⛔ No tenés permiso para este comando.")
        return

    fecha_dt = None
    args = context.args
    if args:
        fecha_str = " ".join(args).strip()
        for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d"):
            try:
                fecha_dt = datetime.strptime(fecha_str, fmt)
                break
            except:
                pass

    hoy = fecha_dt if fecha_dt else datetime.now()
    fecha_bistro = hoy.strftime("%Y-%m-%d")

    await update.message.reply_text(f"🔌 Conectando a Bistrosoft para {fecha_bistro}...")

    token = await bistrosoft_get_token()
    if not token:
        await update.message.reply_text("❌ No se pudo obtener token de Bistrosoft. Verificá usuario/contraseña.")
        return

    await update.message.reply_text("✅ Token OK. Trayendo transacciones...")

    import aiohttp
    headers = {"Authorization": f"bearer {token}", "Accept": "application/json"}
    params  = {"startDate": fecha_bistro, "endDate": fecha_bistro, "pageNumber": 0}

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{BISTROSOFT_API}/api/v1/TransactionDetailReport",
                params=params,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    await update.message.reply_text(f"❌ Error {resp.status}: {body[:300]}")
                    return
                data = await resp.json(content_type=None)
    except Exception as e:
        await update.message.reply_text(f"❌ Error de red: {e}")
        return

    items = data.get("items") or []
    total = data.get("totalCount", 0)
    pages = data.get("totalPages", 0)

    if not items:
        await update.message.reply_text(
            f"📭 Bistrosoft no devolvió transacciones para {fecha_bistro}\n"
            f"Total según API: {total} | Páginas: {pages}"
        )
        return

    # Contar tipos de transacción
    tipos = {}
    shops = {}
    for item in items:
        tt = str(item.get("transactionType") or "(vacío)").strip()
        sh = str(item.get("shop") or "").strip()
        tipos[tt] = tipos.get(tt, 0) + 1
        shops[sh] = shops.get(sh, 0) + 1

    lineas = [
        f"📊 *Bistrosoft {fecha_bistro}*",
        f"Total items página 0: {len(items)} de {total} ({pages} páginas)",
        "",
        "*Tipos de transacción:*",
    ]
    for tt, cnt in sorted(tipos.items(), key=lambda x: -x[1]):
        lineas.append(f"  · `{tt}` — {cnt}")

    lineas.append("")
    lineas.append("*Locales/Shops:*")
    for sh, cnt in sorted(shops.items(), key=lambda x: -x[1]):
        lineas.append(f"  · {sh} — {cnt}")

    lineas.append("")
    lineas.append("*Muestra de 3 registros crudos:*")
    for item in items[:3]:
        lineas.append(
            f"  · Tipo: `{item.get('transactionType')}` | "
            f"Monto: ${item.get('amount',0):,.0f} | "
            f"Shop: {item.get('shop')} | "
            f"Producto: {item.get('product') or item.get('comments') or '—'}"
        )

    await update.message.reply_text("\n".join(lineas), parse_mode="Markdown")




# ── BISTROSOFT INTEGRATION ────────────────────────────────────────────────────

BISTROSOFT_API     = "https://ar-api.bistrosoft.com"
BISTROSOFT_USER    = os.environ.get("BISTROSOFT_USER", "pomodoroconsulting@gmail.com")
BISTROSOFT_PASS    = os.environ.get("BISTROSOFT_PASS", "7027")
BISTROSOFT_TOKEN   = None
BISTROSOFT_EXPIRY  = None

# Mapa local Bistrosoft shopCode → nombre local en el Sheet
SHOP_LOCAL_MAP = {
    "11113946": "Lharmonie 5 - Libertador 3118",
    "11113046": "Lharmonie 3 - Maure 1516",
    "11111541": "Lharmonie 2 - Nicaragua 6068",
    "11113448": "Lharmonie 4 - Zabala 1925",
}

# Tipos de transacción de Bistrosoft que consideramos egresos/pagos a proveedores
EGRESO_TYPES = {"egreso", "pago", "gasto", "proveedor", "expense", "payment", "salida"}

TOLERANCIA_MONTO = 0.05  # 5%

async def bistrosoft_get_token() -> str | None:
    """Obtiene o renueva el token de Bistrosoft."""
    global BISTROSOFT_TOKEN, BISTROSOFT_EXPIRY
    import aiohttp
    now = datetime.utcnow()
    if BISTROSOFT_TOKEN and BISTROSOFT_EXPIRY and now < BISTROSOFT_EXPIRY:
        return BISTROSOFT_TOKEN
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{BISTROSOFT_API}/api/v1/Token",
                json={"username": BISTROSOFT_USER, "password": BISTROSOFT_PASS},
                headers={"Content-Type": "application/json", "Accept": "application/json"},
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json(content_type=None)
                    BISTROSOFT_TOKEN = data.get("token") or data.get("Token")
                    exp_str = data.get("expiration") or data.get("Expiration")
                    if exp_str:
                        try:
                            BISTROSOFT_EXPIRY = datetime.fromisoformat(exp_str.replace("Z",""))
                        except:
                            BISTROSOFT_EXPIRY = None
                    log.info(f"✅ Bistrosoft token obtenido, expira: {BISTROSOFT_EXPIRY}")
                    return BISTROSOFT_TOKEN
                else:
                    body = await resp.text()
                    log.error(f"❌ Bistrosoft login error {resp.status}: {body}")
                    return None
    except Exception as e:
        log.error(f"❌ Bistrosoft token exception: {e}")
        return None


async def bistrosoft_get_egresos(fecha: str) -> list:
    """
    Trae todas las transacciones de tipo egreso de Bistrosoft para una fecha dada.
    fecha: formato yyyy-MM-dd
    Devuelve lista de dicts con los campos relevantes.
    """
    import aiohttp
    token = await bistrosoft_get_token()
    if not token:
        log.error("❌ No se pudo obtener token de Bistrosoft")
        return []

    headers = {
        "Authorization": f"bearer {token}",
        "Accept": "application/json",
    }

    todos = []
    page = 0
    while True:
        params = {
            "startDate": fecha,
            "endDate": fecha,
            "pageNumber": page,
        }
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{BISTROSOFT_API}/api/v1/TransactionDetailReport",
                    params=params,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as resp:
                    if resp.status == 429:
                        log.warning("⚠️ Bistrosoft rate limit, esperando 60s")
                        await asyncio.sleep(60)
                        continue
                    if resp.status != 200:
                        body = await resp.text()
                        log.error(f"❌ Bistrosoft TransactionDetailReport {resp.status}: {body}")
                        break
                    data = await resp.json(content_type=None)
                    items = data.get("items") or []
                    todos.extend(items)
                    total_pages = data.get("totalPages", 1)
                    log.info(f"✅ Bistrosoft página {page}/{total_pages}: {len(items)} items")
                    if page >= total_pages - 1:
                        break
                    page += 1
                    await asyncio.sleep(2)  # respetar rate limit: 12 req/min
        except Exception as e:
            log.error(f"❌ Bistrosoft fetch error: {e}")
            break

    # Filtrar solo egresos/pagos
    egresos = []
    tipos_vistos = set()
    for item in todos:
        tt = str(item.get("transactionType") or "").lower().strip()
        tipos_vistos.add(tt)
        if any(e in tt for e in EGRESO_TYPES):
            egresos.append(item)

    log.info(f"✅ Bistrosoft: {len(todos)} transacciones totales, {len(egresos)} egresos. Tipos vistos: {tipos_vistos}")
    return egresos


def get_facturas_del_dia(fecha_str: str) -> list:
    """
    Trae las facturas del Sheet para una fecha dada.
    fecha_str: formato DD/MM/YYYY
    """
    try:
        gc, sh = get_sheets_client()
        if not sh:
            return []
        ws = sh.worksheet("Facturas")
        all_values = ws.get_all_values()
        header_idx = 0
        for i, row in enumerate(all_values):
            if "Proveedor" in row or "Fecha FC" in row:
                header_idx = i
                break
        headers = all_values[header_idx]

        def gcol(row, col_name):
            try:
                idx = headers.index(col_name)
                return row[idx].strip() if idx < len(row) else ""
            except:
                return ""

        facturas = []
        for row in all_values[header_idx+1:]:
            if not any(row): continue
            fecha = gcol(row, "Fecha FC")
            if fecha != fecha_str:
                continue
            try:
                total = float(str(gcol(row, "Total")).replace("$","").replace(".","").replace(",",".").strip() or 0)
            except:
                total = 0
            facturas.append({
                "proveedor": gcol(row, "Proveedor"),
                "local":     gcol(row, "Local"),
                "total":     total,
                "nro":       gcol(row, "# Factura"),
                "estado":    gcol(row, "Estado"),
                "cajero":    gcol(row, "Cajero"),
            })
        return facturas
    except Exception as e:
        log.error(f"❌ get_facturas_del_dia error: {e}")
        return []


def cruzar_egresos_con_facturas(egresos: list, facturas: list) -> dict:
    """
    Cruza egresos de Bistrosoft con facturas del Sheet.
    Devuelve un dict con:
      - confirmados: egreso matchea exacto (±5%) con una factura
      - sospechosos: egreso matchea parcialmente (monto similar pero algo difiere)
      - sin_factura: egreso sin ninguna factura que coincida
    """
    confirmados = []
    sospechosos = []
    sin_factura = []

    facturas_usadas = set()

    for egreso in egresos:
        monto_e = float(egreso.get("amount") or 0)
        shop_code = str(egreso.get("shopCode") or "")
        local_e = SHOP_LOCAL_MAP.get(shop_code, egreso.get("shop", ""))
        fecha_e = egreso.get("date", "")
        comentario = egreso.get("comments") or egreso.get("product") or ""
        usuario_e = egreso.get("user", "")

        if monto_e <= 0:
            continue

        mejor_match = None
        mejor_score = 0

        for i, fac in enumerate(facturas):
            if i in facturas_usadas:
                continue

            monto_f = fac["total"]
            if monto_f <= 0:
                continue

            # Score de coincidencia
            score = 0
            diferencia_pct = abs(monto_e - monto_f) / max(monto_e, monto_f)

            if diferencia_pct <= TOLERANCIA_MONTO:
                score += 3  # monto coincide exacto
            elif diferencia_pct <= 0.15:
                score += 1  # monto similar

            # Local coincide
            local_f = fac["local"].lower()
            if local_e.lower() in local_f or local_f in local_e.lower():
                score += 2

            # Proveedor en comentario
            prov_f = fac["proveedor"].lower()
            if prov_f and (prov_f in comentario.lower() or comentario.lower() in prov_f):
                score += 2

            if score > mejor_score:
                mejor_score = score
                mejor_match = (i, fac, diferencia_pct, score)

        if mejor_match:
            idx_fac, fac, dif_pct, score = mejor_match
            if score >= 5 and dif_pct <= TOLERANCIA_MONTO:
                # Coincidencia fuerte → confirmado
                confirmados.append({"egreso": egreso, "factura": fac, "diferencia_pct": dif_pct})
                facturas_usadas.add(idx_fac)
            elif score >= 3:
                # Coincidencia parcial → sospechoso (posible mal cargado)
                sospechosos.append({"egreso": egreso, "factura": fac, "diferencia_pct": dif_pct, "score": score})
            else:
                sin_factura.append(egreso)
        else:
            sin_factura.append(egreso)

    return {
        "confirmados": confirmados,
        "sospechosos": sospechosos,
        "sin_factura": sin_factura,
    }


def fmt_egreso(egreso: dict) -> str:
    monto = egreso.get("amount", 0)
    shop = SHOP_LOCAL_MAP.get(str(egreso.get("shopCode","")), egreso.get("shop","?"))
    local_short = shop.split("-")[-1].strip() if "-" in shop else shop
    comentario = egreso.get("comments") or egreso.get("product") or "—"
    usuario = egreso.get("user","—")
    hora = egreso.get("hour","")
    return f"${monto:,.0f} · {local_short} · {comentario[:30]} · {usuario} {hora}"


async def auditoria_bistrosoft(bot, fecha_dt=None):
    """
    Tarea diaria: consulta Bistrosoft, cruza con Sheet, notifica.
    Se ejecuta a las 20hs hora Argentina (UTC-3 → 23:00 UTC).
    Si se pasa fecha_dt, usa esa fecha en vez de hoy.
    """
    hoy = fecha_dt if fecha_dt else datetime.now()
    fecha_bistro = hoy.strftime("%Y-%m-%d")   # yyyy-MM-dd para Bistrosoft
    fecha_sheet  = hoy.strftime("%d/%m/%Y")   # DD/MM/YYYY para el Sheet

    log.info(f"🔍 Auditoría Bistrosoft arrancando para {fecha_bistro}...")

    egresos  = await bistrosoft_get_egresos(fecha_bistro)
    facturas = get_facturas_del_dia(fecha_sheet)

    log.info(f"📊 Egresos Bistrosoft: {len(egresos)} | Facturas Sheet: {len(facturas)}")

    if not egresos:
        msg = (
            f"📊 *Auditoría diaria — {hoy.strftime('%d/%m/%Y')}*\n\n"
            f"No se encontraron egresos en Bistrosoft para hoy.\n"
            f"_(Verificá que la API esté activa o que haya movimientos de caja)_"
        )
        for chat_id in NOTIFY_IDS:
            try:
                await bot.send_message(chat_id=chat_id, text=msg, parse_mode="Markdown")
            except Exception as e:
                log.warning(f"No se pudo notificar {chat_id}: {e}")
        return

    resultado = cruzar_egresos_con_facturas(egresos, facturas)
    confirmados = resultado["confirmados"]
    sospechosos = resultado["sospechosos"]
    sin_factura = resultado["sin_factura"]

    # Construir mensaje
    lineas = [f"📊 *Auditoría diaria — {hoy.strftime('%d/%m/%Y')}*\n"]
    lineas.append(f"Total egresos Bistrosoft: *{len(egresos)}*")
    lineas.append(f"Facturas cargadas hoy: *{len(facturas)}*\n")

    if confirmados:
        total_confirmado = sum(item["egreso"].get("amount", 0) for item in confirmados)
        lineas.append(f"✅ *{len(confirmados)} egreso{'s' if len(confirmados) != 1 else ''} ya cargado{'s' if len(confirmados) != 1 else ''} — ${total_confirmado:,.0f} total*")
        lineas.append("")

    if sospechosos:
        lineas.append(f"🔍 *Posibles coincidencias ({len(sospechosos)}) — revisar:*")
        for item in sospechosos:
            eg = item["egreso"]
            fac = item["factura"]
            dif = item["diferencia_pct"] * 100
            lineas.append(
                f"  · Bistrosoft: ${eg.get('amount',0):,.0f} vs Sheet: ${fac['total']:,.0f} "
                f"(dif {dif:.1f}%) — {fac['proveedor'] or '?'}"
            )
        lineas.append("")

    if sin_factura:
        lineas.append(f"⚠️ *SIN FACTURA ({len(sin_factura)}) — no encontrados en el sistema:*")
        for eg in sin_factura:
            lineas.append(f"  · {fmt_egreso(eg)}")
        lineas.append("")
        lineas.append("👆 Estos egresos están en Bistrosoft pero no tienen factura cargada.")
    else:
        lineas.append("🎉 Todos los egresos tienen factura asociada.")

    msg = "\n".join(lineas)

    # Telegram tiene límite de 4096 chars
    if len(msg) > 4000:
        msg = msg[:3900] + "\n\n_(Mensaje truncado — hay más egresos)_"

    for chat_id in NOTIFY_IDS:
        try:
            await bot.send_message(chat_id=chat_id, text=msg, parse_mode="Markdown")
            log.info(f"✅ Auditoría enviada a {chat_id}")
        except Exception as e:
            log.warning(f"No se pudo notificar {chat_id}: {e}")


async def cmd_auditoria(update, context):
    """
    Comando manual /auditoria — solo para Martín.
    Uso: /auditoria            → auditoría de hoy
         /auditoria 16/03/2026 → auditoría de esa fecha
    """
    chat_id = update.effective_chat.id
    if chat_id != 6457094702:
        await update.message.reply_text("⛔ No tenés permiso para este comando.")
        return

    fecha_dt = None
    args = context.args
    if args:
        fecha_str = " ".join(args).strip()
        for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d"):
            try:
                fecha_dt = datetime.strptime(fecha_str, fmt)
                break
            except:
                pass
        if not fecha_dt:
            await update.message.reply_text(
                "⚠️ Formato de fecha inválido.\nUsá: /auditoria 16/03/2026"
            )
            return

    if fecha_dt:
        await update.message.reply_text(f"🔍 Ejecutando auditoría para el {fecha_dt.strftime('%d/%m/%Y')}...")
    else:
        await update.message.reply_text("🔍 Ejecutando auditoría de hoy...")

    await auditoria_bistrosoft(context.bot, fecha_dt=fecha_dt)


async def scheduler(bot):
    """
    Loop que ejecuta la auditoría todos los días a las 20:00 hora Argentina (UTC-3).
    En Railway el servidor corre en UTC, así que dispara a las 23:00 UTC.
    """
    HORA_UTC = 23  # 20hs Argentina = 23hs UTC
    MIN_UTC  = 0

    log.info(f"⏰ Scheduler iniciado — auditoría diaria a las {HORA_UTC}:{MIN_UTC:02d} UTC (20hs Argentina)")
    ultimo_dia = None

    while True:
        ahora = datetime.utcnow()
        if ahora.hour == HORA_UTC and ahora.minute == MIN_UTC and ahora.date() != ultimo_dia:
            ultimo_dia = ahora.date()
            log.info("⏰ Disparando auditoría Bistrosoft...")
            try:
                await auditoria_bistrosoft(bot)
            except Exception as e:
                log.error(f"❌ Error en auditoría programada: {e}")
        await asyncio.sleep(30)  # chequear cada 30 segundos


async def cmd_mantenimiento(update, context):
    """/mantenimiento — Solo Martín. Unifica proveedores, normaliza Facturas, ordena y formatea todas las pestañas."""
    chat_id = update.effective_chat.id
    if chat_id != 6457094702:
        await update.message.reply_text("⛔ No tenés permiso.")
        return
    await update.message.reply_text("🔧 Iniciando mantenimiento completo... puede tardar 2-3 minutos.")
    import re as _re, time as _time, anthropic as _anthropic

    def norm(s):
        s = str(s).upper().strip()
        s = _re.sub(r'[^A-Z0-9 ]', ' ', s)
        s = _re.sub(r'\s+', ' ', s).strip()
        return s

    def parse_num(s):
        try: return float(str(s).replace('$','').replace('.','').replace(',','.').strip() or 0)
        except: return 0

    def safe_write(fn, retries=6):
        for attempt in range(retries):
            try: return fn()
            except Exception as e:
                if '429' in str(e) or 'Quota' in str(e):
                    wait = 20*(attempt+1); log.warning(f"⚠️ Rate limit {wait}s..."); _time.sleep(wait)
                else: raise
        return None

    try:
        gc, sh = get_sheets_client()
        if not sh:
            await update.message.reply_text("❌ Sin credenciales."); return

        # PASO 1: Leer Facturas
        await update.message.reply_text("📋 1/5 — Leyendo facturas...")
        wf = sh.worksheet("Facturas")
        fvals = wf.get_all_values()
        fhi = 0
        for i, row in enumerate(fvals):
            if "Proveedor" in row or "Fecha FC" in row: fhi = i; break
        fheaders = fvals[fhi]
        def fgcol(row, cn):
            try:
                idx = fheaders.index(cn)
                return row[idx].strip() if idx < len(row) else ""
            except: return ""
        from_facturas = {}
        for row in fvals[fhi+1:]:
            if not any(row): continue
            prov = fgcol(row,"Proveedor").strip()
            cuit = fgcol(row,"CUIT").strip()
            cat = fgcol(row,"Categoría").strip()
            cond = fgcol(row,"Medio de Pago").strip()
            fecha = fgcol(row,"Fecha FC").strip()
            try: total = float(fgcol(row,"Total").replace("$","").replace(".","").replace(",",".").strip() or 0)
            except: total = 0
            if not prov: continue
            key = cuit.strip() if cuit.strip() else _re.sub(r'\s+',' ',prov.upper().strip())
            if key not in from_facturas:
                from_facturas[key] = {"razon":prov,"cuit":cuit,"total":0,"ultima_fecha":"","categoria":cat,"condicion":cond}
            from_facturas[key]["total"] += total
            if fecha > from_facturas[key]["ultima_fecha"]: from_facturas[key]["ultima_fecha"] = fecha
            if not from_facturas[key]["cuit"] and cuit: from_facturas[key]["cuit"] = cuit

        # PASO 2: IA
        await update.message.reply_text(f"🤖 2/5 — Unificando {len(from_facturas)} proveedores con IA...")
        lista_raw = [f"- CUIT: {v['cuit'] or 'sin CUIT'} | Nombre: {v['razon']} | Total: ${v['total']:,.0f}" for v in from_facturas.values()]
        prompt = """Sos asistente contable argentino. Agrupá proveedores que son el mismo. Para cada grupo: razon_social, nombre_fantasia, cuit, nombres_originales. SOLO JSON:
[{"razon_social":"...","nombre_fantasia":"...","cuit":"...","nombres_originales":["..."]}]
Proveedores:
""" + "\n".join(lista_raw)
        client = _anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        resp = client.messages.create(model="claude-opus-4-6", max_tokens=4000, messages=[{"role":"user","content":prompt}])
        raw = resp.content[0].text.strip()
        if raw.startswith("```"): raw = raw.split("```")[1]; raw = raw[4:] if raw.startswith("json") else raw
        grupos = json.loads(raw.strip())
        await update.message.reply_text(f"✅ IA agrupó en {len(grupos)} proveedores únicos.")
        nombre_map = {}
        for g in grupos:
            rn = g.get("razon_social","").strip()
            for no in g.get("nombres_originales",[]): nombre_map[no.upper().strip()] = rn

        # PASO 3: Actualizar Proveedores
        await update.message.reply_text("📝 3/5 — Actualizando Proveedores...")
        try: wp = sh.worksheet("Proveedores")
        except:
            wp = sh.add_worksheet("Proveedores",rows=500,cols=13)
            wp.append_row(["Razón Social","Nombre Fantasía","CUIT","Alias / CBU","Banco","Condición de Pago","Categoría","Teléfono","Email","Contacto","Última Compra","Total Comprado","Observaciones"])
        pvals = wp.get_all_values()
        phi = 0
        for i, row in enumerate(pvals):
            if "Razón Social" in row or "Razon Social" in row: phi = i; break
        pheaders = pvals[phi]
        def pgcol(row, cn):
            try:
                idx = pheaders.index(cn)
                return row[idx].strip() if idx < len(row) else ""
            except: return ""
        prov_index = {}; prov_norm = {}
        for i, row in enumerate(pvals[phi+1:]):
            if not any(row): continue
            razon = pgcol(row,"Razón Social").strip(); cuit = pgcol(row,"CUIT").strip()
            if not razon: continue
            key = cuit if cuit else norm(razon)
            prov_index[key] = {"row_num":phi+2+i,"razon":razon,"fantasia":pgcol(row,"Nombre Fantasía"),
                "cuit":cuit,"condicion":pgcol(row,"Condición de Pago"),"cat":pgcol(row,"Categoría"),
                "ultima":pgcol(row,"Última Compra"),"total":parse_num(pgcol(row,"Total Comprado"))}
            prov_norm[norm(razon)] = key
        try:
            col_razon=pheaders.index("Razón Social")+1; col_fant=pheaders.index("Nombre Fantasía")+1
            col_cuit=pheaders.index("CUIT")+1; col_cond=pheaders.index("Condición de Pago")+1
            col_cat=pheaders.index("Categoría")+1; col_ult=pheaders.index("Última Compra")+1
            col_tot=pheaders.index("Total Comprado")+1
        except: col_razon=col_fant=col_cuit=col_cond=col_cat=col_ult=col_tot=None
        agregados = actualizados = 0
        for grupo in grupos:
            rn=grupo.get("razon_social","").strip(); fn=grupo.get("nombre_fantasia","").strip()
            cn=grupo.get("cuit","").strip(); nos=grupo.get("nombres_originales",[])
            if not rn: continue
            tg=0; ug=""; catg=""; condg=""
            for no in nos:
                k = cn if cn else _re.sub(r'\s+',' ',no.upper().strip())
                if k in from_facturas:
                    tg+=from_facturas[k]["total"]
                    if from_facturas[k]["ultima_fecha"]>ug: ug=from_facturas[k]["ultima_fecha"]
                    if not catg: catg=from_facturas[k]["categoria"]
                    if not condg: condg=from_facturas[k]["condicion"]
            kp = cn if cn else norm(rn)
            ex = prov_index.get(kp)
            if not ex:
                for no in nos:
                    nk=norm(no)
                    if nk in prov_norm and prov_norm[nk] in prov_index: ex=prov_index[prov_norm[nk]]; break
            if ex and col_razon:
                nt=max(ex["total"],tg) if tg>ex["total"] else ex["total"]
                nu=max(ex["ultima"],ug) if ug else ex["ultima"]
                rnum=ex["row_num"]
                _time.sleep(1)
                safe_write(lambda rnum=rnum,rn=rn: wp.update(values=[[rn]],range_name=f"{chr(64+col_razon)}{rnum}"))
                if fn: safe_write(lambda rnum=rnum,fn=fn: wp.update(values=[[fn]],range_name=f"{chr(64+col_fant)}{rnum}"))
                if cn: safe_write(lambda rnum=rnum,cn=cn: wp.update(values=[[cn]],range_name=f"{chr(64+col_cuit)}{rnum}"))
                if condg: safe_write(lambda rnum=rnum,condg=condg: wp.update(values=[[condg]],range_name=f"{chr(64+col_cond)}{rnum}"))
                if catg: safe_write(lambda rnum=rnum,catg=catg: wp.update(values=[[catg]],range_name=f"{chr(64+col_cat)}{rnum}"))
                if nu: safe_write(lambda rnum=rnum,nu=nu: wp.update(values=[[nu]],range_name=f"{chr(64+col_ult)}{rnum}"))
                safe_write(lambda rnum=rnum,nt=nt: wp.update(values=[[round(nt,2)]],range_name=f"{chr(64+col_tot)}{rnum}"))
                actualizados += 1
            elif col_razon:
                _time.sleep(1)
                safe_write(lambda: wp.append_row([rn,fn,cn,"","",condg,catg,"","","",ug,round(tg,2),"",]))
                agregados += 1

        # PASO 4: Normalizar nombres en Facturas
        await update.message.reply_text("🔤 4/5 — Normalizando nombres en Facturas...")
        try:
            col_prov_idx = fheaders.index("Proveedor"); updates_f = 0
            for row_idx, row in enumerate(fvals[fhi+1:], start=fhi+2):
                if not any(row): continue
                pa = row[col_prov_idx].strip() if col_prov_idx < len(row) else ""
                if not pa: continue
                nn = nombre_map.get(pa.upper().strip())
                if nn and nn != pa:
                    cl = chr(64+col_prov_idx+1); _time.sleep(0.5)
                    safe_write(lambda cl=cl,row_idx=row_idx,nn=nn: wf.update(values=[[nn]],range_name=f"{cl}{row_idx}"))
                    updates_f += 1
            await update.message.reply_text(f"✅ {updates_f} nombres normalizados.")
        except Exception as e: log.warning(f"Error normalizando: {e}")

        # PASO 5: Ordenar, dedup y formatear Proveedores
        await update.message.reply_text("🎨 5/5 — Ordenando y formateando todas las pestañas...")
        _time.sleep(3)
        pvals2 = wp.get_all_values()
        ph2 = 0
        for i, row in enumerate(pvals2):
            if "Razón Social" in row or "Razon Social" in row: ph2 = i; break
        title2=pvals2[:ph2]; header2=pvals2[ph2]; data2=pvals2[ph2+1:]
        seen2=set(); dedup2=[]
        for row in data2:
            if not any(row): continue
            razon2=row[0].strip() if len(row)>0 else ""; cuit2=row[2].strip() if len(row)>2 else ""
            k2=cuit2 if cuit2 else norm(razon2)
            if not k2: continue
            if k2 not in seen2: seen2.add(k2); dedup2.append(row)
        dedup2.sort(key=lambda r: r[0].upper().strip() if r else "")
        nc2=len(header2); dedup2=[(list(r)+[""]*(nc2-len(r)))[:nc2] for r in dedup2]
        new_data2=title2+[header2]+dedup2
        _time.sleep(2); safe_write(lambda: wp.clear()); _time.sleep(2)
        safe_write(lambda: wp.update(values=new_data2,range_name="A1")); _time.sleep(2)

        from googleapiclient.discovery import build as _build
        from google.oauth2.service_account import Credentials as _Creds
        creds2=_Creds.from_service_account_info(json.loads(os.environ.get("GOOGLE_CREDENTIALS","")),
            scopes=["https://www.googleapis.com/auth/spreadsheets"])
        svc=_build("sheets","v4",credentials=creds2,cache_discovery=False)
        sid=os.environ.get("SHEETS_ID","")
        meta=svc.spreadsheets().get(spreadsheetId=sid).execute()

        COLOR_DARK = {"red":0.102,"green":0.063,"blue":0.031}
        COLOR_BROWN = {"red":0.549,"green":0.388,"blue":0.251}
        COLOR_BEIGE = {"red":0.992,"green":0.980,"blue":0.957}
        COLOR_TEXT_LIGHT = {"red":0.961,"green":0.941,"blue":0.910}
        COLOR_TEXT_DARK = {"red":0.102,"green":0.063,"blue":0.031}

        def fmt_requests(sheet_id, nrows):
            return [
                {"repeatCell":{"range":{"sheetId":sheet_id,"startRowIndex":0,"endRowIndex":1},
                    "cell":{"userEnteredFormat":{"backgroundColor":COLOR_DARK,
                    "textFormat":{"foregroundColor":COLOR_TEXT_LIGHT,"bold":True,"fontSize":11},
                    "horizontalAlignment":"CENTER"}},"fields":"userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)"}},
                {"repeatCell":{"range":{"sheetId":sheet_id,"startRowIndex":1,"endRowIndex":2},
                    "cell":{"userEnteredFormat":{"backgroundColor":COLOR_BROWN,
                    "textFormat":{"foregroundColor":COLOR_TEXT_LIGHT,"bold":True},
                    "horizontalAlignment":"CENTER"}},"fields":"userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)"}},
                {"repeatCell":{"range":{"sheetId":sheet_id,"startRowIndex":2,"endRowIndex":max(nrows,3)},
                    "cell":{"userEnteredFormat":{"backgroundColor":COLOR_BEIGE,
                    "textFormat":{"foregroundColor":COLOR_TEXT_DARK,"bold":False}}},"fields":"userEnteredFormat(backgroundColor,textFormat)"}},
                {"updateSheetProperties":{"properties":{"sheetId":sheet_id,"gridProperties":{"frozenRowCount":2}},"fields":"gridProperties.frozenRowCount"}},
            ]

        for tab_name in ["Proveedores","Facturas","Artículos"]:
            tab_meta = next((s for s in meta.get("sheets",[]) if s["properties"]["title"]==tab_name), None)
            if not tab_meta: continue
            tab_id = tab_meta["properties"]["sheetId"]
            try:
                tab_ws = sh.worksheet(tab_name)
                all_vals = tab_ws.get_all_values()
                nrows = len(all_vals)
                ncols = len(all_vals[1]) if len(all_vals) > 1 else 20
                requests = fmt_requests(tab_id, nrows)
                # Agregar filtro en fila de headers (fila 2 = índice 1)
                requests.append({
                    "setBasicFilter": {
                        "filter": {
                            "range": {
                                "sheetId": tab_id,
                                "startRowIndex": 1,
                                "endRowIndex": nrows,
                                "startColumnIndex": 0,
                                "endColumnIndex": ncols,
                            }
                        }
                    }
                })
                svc.spreadsheets().batchUpdate(spreadsheetId=sid, body={"requests":requests}).execute()
                log.info(f"✅ {tab_name} formateada con filtros")
            except Exception as e: log.warning(f"No se pudo formatear {tab_name}: {e}")

        cargar_proveedores_conocidos()
        dupes_elim = len(data2) - len(dedup2)
        await update.message.reply_text(
            f"✅ *Mantenimiento completo*\n\n"
            f"🤖 Grupos IA: {len(grupos)}\n"
            f"🔄 Actualizados: {actualizados}\n"
            f"➕ Agregados: {agregados}\n"
            f"🗑️ Duplicados eliminados: {dupes_elim}\n"
            f"📋 Ordenado alfabéticamente\n"
            f"🎨 Todas las pestañas formateadas",
            parse_mode="Markdown"
        )
    except Exception as e:
        log.error(f"Error en /mantenimiento: {e}", exc_info=True)
        await update.message.reply_text(f"❌ Error: {str(e)[:300]}")


def inicializar_columna_imagen():
    """Agrega la columna Imagen al Sheet de Facturas si no existe."""
    try:
        gc, sh = get_sheets_client()
        if not sh: return
        ws = sh.worksheet("Facturas")
        headers = ws.row_values(2)
        if "Imagen" not in headers:
            col_num = len(headers) + 1
            ws.update_cell(2, col_num, "Imagen")
            log.info(f"✅ Columna Imagen agregada en col {col_num}")
        else:
            log.info("✅ Columna Imagen ya existe")
    except Exception as e:
        log.warning(f"No se pudo inicializar columna Imagen: {e}")


async def monitor_anthropic(bot):
    """Loop que chequea cada 2 minutos si la API de Anthropic está operativa.
    Si detecta que estuvo caída y volvió, notifica a NOTIFY_IDS."""
    global hubo_overload
    import anthropic as _anth
    log.info("🔍 Monitor Anthropic iniciado")
    while True:
        await asyncio.sleep(120)  # chequear cada 2 minutos
        if not hubo_overload:
            continue
        try:
            client = _anth.Anthropic(api_key=ANTHROPIC_API_KEY)
            client.messages.create(
                model="claude-opus-4-6",
                max_tokens=10,
                messages=[{"role": "user", "content": "ok"}]
            )
            # Si llegamos acá, la API respondió bien
            hubo_overload = False
            log.info("✅ API Anthropic recuperada — notificando")
            for chat_id_notif in NOTIFY_IDS:
                try:
                    await bot.send_message(
                        chat_id=chat_id_notif,
                        text="✅ *El sistema volvió a funcionar correctamente.*\n\nYa podés cargar facturas de nuevo.",
                        parse_mode="Markdown"
                    )
                except Exception as e:
                    log.warning(f"No se pudo notificar recovery a {chat_id_notif}: {e}")
        except Exception as e:
            if "529" in str(e) or "overloaded" in str(e).lower():
                log.info("⏳ API Anthropic sigue sobrecargada...")
            else:
                log.warning(f"Monitor Anthropic error inesperado: {e}")


async def handle_error_global(update, context):
    """Manejador global de errores — notifica al usuario y a los admins."""
    error = context.error
    log.error(f"❌ Error global: {error}", exc_info=True)

    # Mensaje al usuario que estaba interactuando
    if update and update.effective_chat:
        try:
            await context.bot.send_message(
                chat_id=update.effective_chat.id,
                text=(
                    "⚠️ *Ocurrió un error inesperado.*\n\n"
                    "El equipo ya fue notificado. "
                    "Podés intentarlo de nuevo en unos minutos.\n\n"
                    "Si el problema persiste, avisale a Martín."
                ),
                parse_mode="Markdown"
            )
        except Exception:
            pass

    # Notificar a los admins
    import traceback
    error_txt = "".join(traceback.format_exception(type(error), error, error.__traceback__))[-500:]
    usuario = ""
    if update and update.effective_user:
        usuario = f" (usuario: {update.effective_user.first_name or update.effective_chat.id})"
    for chat_id_notif in NOTIFY_IDS:
        try:
            await context.bot.send_message(
                chat_id=chat_id_notif,
                text=(
                    f"🔴 *Error en el bot*{usuario}\n\n"
                    f"`{error_txt}`"
                ),
                parse_mode="Markdown"
            )
        except Exception:
            pass


def main():
    from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters
    if not ANTHROPIC_API_KEY:
        print("❌ Falta ANTHROPIC_API_KEY")
        return
    print("🤖 Iniciando Bot Facturas Lharmonie v3...")

    inicializar_usuarios_sheet()
    inicializar_columna_imagen()
    cargar_proveedores_conocidos()

    api_thread = threading.Thread(target=start_api_server, daemon=True)
    api_thread.start()

    app = ApplicationBuilder().token(TELEGRAM_TOKEN).build()
    app.add_handler(CommandHandler("start",          cmd_start))
    app.add_handler(CommandHandler("help",           cmd_help))
    app.add_handler(CommandHandler("ultimas",        cmd_ultimas))
    app.add_handler(CommandHandler("pago",           cmd_pago))
    app.add_handler(CommandHandler("corregir",       cmd_corregir))
    app.add_handler(CommandHandler("auditoria",      cmd_auditoria))
    app.add_handler(CommandHandler("mantenimiento",  cmd_mantenimiento))
    app.add_handler(CommandHandler("testbistrosoft", cmd_testbistrosoft))
    app.add_handler(MessageHandler(filters.PHOTO, handle_foto))
    app.add_handler(MessageHandler(filters.Document.ALL, handle_documento))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_texto))
    app.add_error_handler(handle_error_global)

    # Arrancar scheduler en background
    async def post_init(application):
        asyncio.create_task(scheduler(application.bot))
        asyncio.create_task(monitor_anthropic(application.bot))

    app.post_init = post_init

    print("✅ Bot corriendo.")
    app.run_polling(drop_pending_updates=True)

if __name__ == "__main__":
    main()
