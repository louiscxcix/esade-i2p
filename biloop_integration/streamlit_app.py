import streamlit as st
import pandas as pd
import google_sheets_fetcher
import biloop_client
import google.generativeai as genai
import json
import os

st.set_page_config(layout="wide", page_title="Biloop Hub")

# Sidebar
st.sidebar.title("Biloop Hub")
view = st.sidebar.radio("Navegación", [
    "📄 Subida de Facturas",
    "🧮 Calculadora de Margen",
    "📊 Google Sheets",
    "📊 Google Sheets 2",
    "📈 Looker Studio",
    "🤖 Co-pilot"
])

if view == "📄 Subida de Facturas":
    st.header("Panel de Facturas")
    st.caption("Sincronización en vivo desde Google Sheets a la API de Biloop")
    
    col1, col2 = st.columns([1, 8])
    with col1:
        if st.button("🔄 Actualizar"):
            st.cache_data.clear()
            st.rerun()
            
    with col2:
        # Date Updates
        with st.expander("Actualizar fechas manualmente"):
            st.write("Para actualizar las fechas, selecciona la fila, modifica el formato de la fecha a DD/MM/AAAA y haz clic en Actualizar.")
    
    @st.cache_data(ttl=60)
    def load_invoices():
        return google_sheets_fetcher.fetch_google_sheets_data()
        
    df = load_invoices()
    if df is not None and not df.empty:
        # Prepare df for display
        display_df = df[['Dynamic Invoice', 'Client Name', 'Candidate Name', 'Position', 'Invoice Date', 'Gross Invoice Amount', 'Status']].copy()
        display_df.columns = ['Nº Factura', 'Cliente', 'Candidato', 'Proceso', 'Fecha Factura', 'Importe Cobro', 'Estado']
        display_df.insert(0, "Seleccionar", False)
        
        st.write("Edita las fechas directamente o marca la casilla 'Seleccionar' para subir a Biloop.")
        edited_df = st.data_editor(display_df, hide_index=True, use_container_width=True)
        
        # Check for date updates by comparing display_df and edited_df
        # Only simple dates update for now
        date_updates = []
        for i in range(len(df)):
            orig = str(display_df.iloc[i]['Invoice Date']).strip()
            curr = str(edited_df.iloc[i]['Invoice Date']).strip()
            if orig != curr:
                # Need the original sheet row index
                row_idx = int(df.iloc[i].name) + 5
                date_updates.append({"row_index": row_idx, "new_date": curr})
                
        if date_updates:
            if st.button("💾 Guardar fechas en Sheets"):
                with st.spinner("Guardando..."):
                    res = google_sheets_fetcher.update_invoice_dates(date_updates)
                    if res.get("success"):
                        st.success(res["message"])
                        st.cache_data.clear()
                    else:
                        st.error(res["message"])
        
        # Upload selected logic
        if st.button("☁️ Subir seleccionadas a Biloop", type="primary"):
            selected_indices = edited_df.index[edited_df['Seleccionar']].tolist()
            if not selected_indices:
                st.warning("Por favor, selecciona al menos una factura para subir.")
            else:
                json_data = google_sheets_fetcher.map_to_biloop_json(df)
                success_count = 0
                for idx in selected_indices:
                    invoice_data = json_data[idx]
                    success = biloop_client.push_invoice_to_biloop(invoice_data)
                    if success is not False:
                        success_count += 1
                st.success(f"Se han subido con éxito {success_count} facturas a Biloop.")
    else:
        st.error("Error al obtener los datos de Google Sheets.")

elif view == "🧮 Calculadora de Margen":
    st.header("Calculadora de Margen")
    st.caption("Calcula y actualiza los márgenes de los reclutadores en línea")
    
    if st.button("🔄 Actualizar Datos"):
        st.cache_data.clear()
        st.rerun()
        
    @st.cache_data(ttl=60)
    def load_margins():
        return google_sheets_fetcher.fetch_margin_sheets_data()
        
    df = load_margins()
    if df is not None and not df.empty:
        json_data = google_sheets_fetcher.map_margin_json(df)
        
        options = {f"{inv.get('_id_factura', 'Row ' + str(inv.get('_sheet_row_index', '')))} - {inv.get('Cliente')} ({inv.get('Candidato')})": i for i, inv in enumerate(json_data)}
        selected = st.selectbox("Seleccionar Factura", list(options.keys()))
        
        if selected:
            idx = options[selected]
            inv = json_data[idx]
            
            col1, col2, col3 = st.columns(3)
            with col1:
                st.text_input("ID Factura", value=inv.get("_id_factura", ""), disabled=True)
                m_percent_str = inv.get('_margen_percent', '0')
                if isinstance(m_percent_str, str) and '%' in m_percent_str:
                    m_percent_raw = float(m_percent_str.replace('%', '')) / 100.0
                else:
                    try:
                        m_percent_raw = float(m_percent_str)
                    except:
                        m_percent_raw = 0.0
                if m_percent_raw > 1: m_percent_raw /= 100.0
                margen_percent = st.number_input("Margen (%) (AF)", value=m_percent_raw, step=0.001)
                
            with col2:
                recruiter = st.text_input("Recruiter (AE)", value=inv.get("_recruiter", ""))
                
                def parse_float(val):
                    if isinstance(val, (int, float)): return float(val)
                    try: return float(str(val).replace('€', '').replace('%', '').replace(',', '').strip() or 0)
                    except: return 0.0
                    
                factura_neta = st.number_input("Factura neta (P) [€]", value=parse_float(inv.get('Factura neta', 0)), step=0.01)
                
            with col3:
                # Comision logic
                if not recruiter or recruiter == '0':
                    calc_comision = 0.0
                else:
                    calc_comision = (1.0 - margen_percent) * factura_neta
                comision = st.number_input("Comisión Recr [€]", value=calc_comision, step=0.01)
                margen_eur = factura_neta - comision
                st.text_input("Margen (AH) [€]", value=f"{margen_eur:.2f}", disabled=True)
                
            if st.button("💾 Actualizar en Sheets", type="primary"):
                with st.spinner("Actualizando..."):
                    result = google_sheets_fetcher.update_row_margins(
                        row_index=inv["_sheet_row_index"],
                        factura_neta=factura_neta,
                        recruiter=recruiter,
                        margen_percent=margen_percent,
                        comision=comision,
                        margen_eur=margen_eur
                    )
                    if result.get("success"):
                        st.success(result["message"])
                        st.cache_data.clear()
                    else:
                        st.error(result.get("message", "Error al actualizar"))

elif view == "📊 Google Sheets":
    st.components.v1.iframe("https://docs.google.com/spreadsheets/d/15ZGlivp5_QRf60X7NChILJBLKE8m54_Z9-s0kGxCQZk/edit?gid=0&usp=sharing&widget=true&headers=false", height=800, scrolling=True)

elif view == "📊 Google Sheets 2":
    st.components.v1.iframe("https://docs.google.com/spreadsheets/d/1Wu_T84la4oqEcXthSZusUblmpF7lUZCSepBvjH2e48I/edit?gid=1105355662&usp=sharing&widget=true&headers=false", height=800, scrolling=True)

elif view == "📈 Looker Studio":
    st.components.v1.iframe("https://lookerstudio.google.com/embed/reporting/32fea7a0-0010-4831-b067-a8b387ee9cdd/page/p_s33znkum1d", height=800, scrolling=True)

elif view == "🤖 Co-pilot":
    st.header("Copiloto IA")
    st.caption("Pregunta a Gemini sobre tus facturas y márgenes")
    
    api_key = None
    if "GEMINI_API_KEY" in st.secrets:
        api_key = st.secrets["GEMINI_API_KEY"]
    else:
        api_key = os.environ.get("GEMINI_API_KEY")
        
    if not api_key:
        st.warning("Falta la clave de API de Gemini. Por favor, configúrala en los secretos de implementación o en `.streamlit/secrets.toml`.")
    else:
        genai.configure(api_key=api_key)
        
        if "messages" not in st.session_state:
            st.session_state.messages = []
            
        for msg in st.session_state.messages:
            with st.chat_message(msg["role"]):
                st.markdown(msg["content"])
                
        if prompt := st.chat_input("Pregunta sobre los que más facturan, facturas sin pagar..."):
            st.session_state.messages.append({"role": "user", "content": prompt})
            with st.chat_message("user"):
                st.markdown(prompt)
                
            with st.chat_message("assistant"):
                with st.spinner("Pensando..."):
                    try:
                        df_invoices = google_sheets_fetcher.fetch_google_sheets_data()
                        df_margins = google_sheets_fetcher.fetch_margin_sheets_data()
                        
                        context = "Invoice Data:\n" + (df_invoices.to_csv(index=False) if df_invoices is not None else "None")
                        context += "\nMargin Data:\n" + (df_margins.to_csv(index=False) if df_margins is not None else "None")
                        
                        system_prompt = f"You are an AI Co-pilot for an internal dashboard. Answer contextually.\n\n{context}"
                        model = genai.GenerativeModel('gemini-2.5-flash', system_instruction=system_prompt)
                        
                        formatted_history = [{"role": "user" if m["role"]=="user" else "model", "parts": [m["content"]]} for m in st.session_state.messages[:-1]]
                        chat = model.start_chat(history=formatted_history)
                        response = chat.send_message(prompt)
                        
                        st.markdown(response.text)
                        st.session_state.messages.append({"role": "assistant", "content": response.text})
                    except Exception as e:
                        st.error(f"Error al acceder a la IA: {str(e)}")
