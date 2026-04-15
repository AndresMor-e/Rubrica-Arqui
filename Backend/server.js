// ── CONFIG SUPABASE ──
require('dotenv').config();
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// ── IMPORTAR DEPENDENCIAS ──
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

// ── INICIALIZAR ──
const app = express();
const PORT = 3000;

// ── MIDDLEWARE ──
app.use(cors());
app.use(express.json());

// ── CLIENTE SUPABASE ──
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── HEALTH CHECK ──
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// endpoints usuarios
// GET usuarios - PARA LOGIN
app.get('/api/rest/v1/usuarios', async (req, res) => {
  try {
    let query = supabase.from('usuarios').select('*');
    
    // Filtrar por username si viene
    if (req.query.username) {
      const username = req.query.username.replace('eq.', '');
      query = query.eq('username', username);
    }
    
    // Ordenar
    if (req.query.order) {
      const [field, direction] = req.query.order.split('.');
      query = query.order(field, { ascending: direction === 'asc' });
    }
    
    const { data, error } = await query;
    if (error) throw error;
    
    console.log(`📋 GET usuarios: ${data ? data.length : 0} usuarios encontrados`);
    res.json(data);
  } catch (error) {
    console.error("Error en GET usuarios:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST crear usuario (registro)
app.post('/api/rest/v1/usuarios', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log(`📝 Intentando crear usuario: ${username}`);
    
    // Verificar si ya existe
    const { data: existe, error: errorExiste } = await supabase
      .from('usuarios')
      .select('username')
      .eq('username', username)
      .maybeSingle();
    
    if (existe) {
      console.log(`❌ Usuario ${username} ya existe`);
      return res.status(400).json({ error: 'Usuario ya existe' });
    }
    
    // Crear usuario
    const { data, error } = await supabase
      .from('usuarios')
      .insert([{ username, password }])
      .select();
    
    if (error) throw error;
    
    console.log(`✅ Usuario ${username} creado exitosamente`);
    res.status(201).json(data);
  } catch (error) {
    console.error("Error en POST usuario:", error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE eliminar usuario
app.delete('/api/rest/v1/usuarios', async (req, res) => {
  try {
    let username = req.query.username;
    if (username && username.startsWith('eq.')) {
      username = username.replace('eq.', '');
    }
    
    if (!username) {
      return res.status(400).json({ error: 'Username requerido' });
    }
    
    console.log(`🗑️ Eliminando usuario: ${username}`);
    
    // Eliminar mensajes
    await supabase.from('mensajes').delete().eq('de', username);
    await supabase.from('mensajes').delete().eq('para', username);
    
    // Eliminar usuario
    const { error } = await supabase.from('usuarios').delete().eq('username', username);
    if (error) throw error;
    
    console.log(`✅ Usuario ${username} eliminado`);
    res.status(204).send();
  } catch (error) {
    console.error("Error en DELETE usuario:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// endpoints mensajes
// ============================================

// GET mensajes directos entre dos usuarios
app.get('/api/rest/v1/mensajes/directos/:user1/:user2', async (req, res) => {
  try {
    const { user1, user2 } = req.params;
    const { data, error } = await supabase
      .from('mensajes')
      .select('*')
      .or(`and(de.eq.${user1},para.eq.${user2}),and(de.eq.${user2},para.eq.${user1})`)
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("Error en GET mensajes directos:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET mensajes con filtros
app.get('/api/rest/v1/mensajes', async (req, res) => {
  try {
    let query = supabase.from('mensajes').select('*');
    
    // Filtrar por para (destinatario)
    if (req.query.para === 'is.null') {
      query = query.is('para', null);
    } else if (req.query.para) {
      query = query.eq('para', req.query.para.replace('eq.', ''));
    }
    
    // Filtrar por de (remitente)
    if (req.query.de) {
      query = query.eq('de', req.query.de.replace('eq.', ''));
    }
    
    // Ordenar
    if (req.query.order) {
      const [field, direction] = req.query.order.split('.');
      query = query.order(field, { ascending: direction === 'asc' });
    } else {
      query = query.order('created_at', { ascending: true });
    }
    
    // Limitar
    if (req.query.limit) {
      query = query.limit(parseInt(req.query.limit));
    }
    
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("Error en GET mensajes:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST crear mensaje
app.post('/api/rest/v1/mensajes', async (req, res) => {
  try {
    const { de, para, mensaje } = req.body;
    
    const { data, error } = await supabase
      .from('mensajes')
      .insert([{ 
        de, 
        para: para || null, 
        mensaje, 
        created_at: new Date().toISOString() 
      }])
      .select();
    
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error("Error en POST mensaje:", error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE eliminar mensaje
app.delete('/api/rest/v1/mensajes', async (req, res) => {
  try {
    let id = req.query.id;
    if (id && id.startsWith('eq.')) {
      id = id.replace('eq.', '');
    }
    
    if (!id) {
      return res.status(400).json({ error: 'ID requerido' });
    }
    
    const { error } = await supabase.from('mensajes').delete().eq('id', id);
    if (error) throw error;
    res.status(204).send();
  } catch (error) {
    console.error("Error en DELETE mensaje:", error);
    res.status(500).json({ error: error.message });
  }
});


// iniciar servidor

app.listen(PORT, () => {
  console.log(`\n✅ Servidor NovaTalk corriendo en http://localhost:${PORT}`);
  console.log(`📡 Endpoints disponibles:\n`);
  console.log(`   USUARIOS:`);
  console.log(`   - GET    http://localhost:${PORT}/api/rest/v1/usuarios`);
  console.log(`   - POST   http://localhost:${PORT}/api/rest/v1/usuarios`);
  console.log(`   - DELETE http://localhost:${PORT}/api/rest/v1/usuarios?username=eq.NOMBRE\n`);
  console.log(`   MENSAJES:`);
  console.log(`   - GET    http://localhost:${PORT}/api/rest/v1/mensajes`);
  console.log(`   - POST   http://localhost:${PORT}/api/rest/v1/mensajes`);
  console.log(`   - DELETE http://localhost:${PORT}/api/rest/v1/mensajes?id=eq.ID`);
  console.log(`   - GET    http://localhost:${PORT}/api/rest/v1/mensajes/directos/:user1/:user2\n`);
  console.log(`   HEALTH:`);
  console.log(`   - GET    http://localhost:${PORT}/health\n`);
});