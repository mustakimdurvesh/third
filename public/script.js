import { supabase } from './supabase.js'

let currentUser = null
let map
let userLat
let userLng
let markers = []
let shownPlaceNames = []
let lastPlaces = []
let lastSituation = ''

document.addEventListener('DOMContentLoaded', async () => {
  const mapEl = document.getElementById('map')
  const headerEl = document.getElementById('header')
  const panelEl = document.getElementById('panel')

  const mapHeight = window.innerHeight -
    headerEl.offsetHeight -
    panelEl.offsetHeight
  mapEl.style.height = mapHeight + 'px'

  // Bug 2 fix — handle password reset token on load
  const hash = window.location.hash
  if (hash.includes('type=recovery')) {
    const params = new URLSearchParams(hash.slice(1))
    const accessToken = params.get('access_token')
    if (accessToken) {
      await supabase.auth.setSession({ access_token: accessToken, refresh_token: '' })
      const newPassword = prompt('Enter your new password:')
      if (newPassword) {
        const { error } = await supabase.auth.updateUser({ password: newPassword })
        if (error) {
          alert('Error: ' + error.message)
        } else {
          alert('Password updated. Please sign in.')
          window.location.hash = ''
        }
      }
    }
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      userLat = position.coords.latitude
      userLng = position.coords.longitude
      initMap(userLat, userLng)
    },
    () => {
      initMap(userLat, userLng)
    }
  )

  setupChips()
  setupFindButton()

  // Auth state handler
  supabase.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null
    const userLabel = document.getElementById('userLabel')
    const authBtn = document.getElementById('authBtn')
    const authPanel = document.getElementById('authPanel')
    if (currentUser) {
      userLabel.textContent = currentUser.email.split('@')[0]
      authBtn.textContent = 'Sign out'
      authPanel.classList.add('hidden')  // Bug 1 fix
    } else {
      userLabel.textContent = ''
      authBtn.textContent = 'Sign in'
      authPanel.classList.add('hidden')  // Bug 1 fix — also hide on signout
    }
  })

  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) {
      currentUser = session.user
      document.getElementById('userLabel').textContent = session.user.email.split('@')[0]
      document.getElementById('authBtn').textContent = 'Sign out'
      document.getElementById('authPanel').classList.add('hidden')
    }
  })

  document.getElementById('authBtn').addEventListener('click', async () => {
    if (currentUser) {
      await supabase.auth.signOut()
    } else {
      // Bug 1 fix — was toggle, now explicitly removes hidden
      document.getElementById('authPanel').classList.remove('hidden')
    }
  })

  document.getElementById('signInBtn').addEventListener('click', async () => {
    const email = document.getElementById('emailInput').value.trim()
    const password = document.getElementById('passwordInput').value.trim()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      document.getElementById('authError').textContent = error.message
      document.getElementById('authError').style.color = '#e53e3e'
      document.getElementById('authError').classList.remove('hidden')
    }
  })

  document.getElementById('signUpBtn').addEventListener('click', async () => {
    const email = document.getElementById('emailInput').value.trim()
    const password = document.getElementById('passwordInput').value.trim()
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      document.getElementById('authError').textContent = error.message
      document.getElementById('authError').style.color = '#e53e3e'
      document.getElementById('authError').classList.remove('hidden')
    } else {
      document.getElementById('authError').textContent = 'Check your email to confirm.'
      document.getElementById('authError').style.color = '#1db954'
      document.getElementById('authError').classList.remove('hidden')
    }
  })

 document.getElementById('forgotBtn').addEventListener('click', async () => {
  const btn = document.getElementById('forgotBtn')
  btn.disabled = true
  btn.textContent = 'Email sent — wait 60s'

  setTimeout(() => {
    btn.disabled = false
    btn.textContent = 'Forgot password?'
  }, 60000)

  const email = document.getElementById('emailInput').value.trim()
  if (!email) {
    document.getElementById('authError').textContent = 'Enter your email first.'
    document.getElementById('authError').style.color = '#e53e3e'
    document.getElementById('authError').classList.remove('hidden')
    btn.disabled = false
    btn.textContent = 'Forgot password?'
    return
  }
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://third-umber.vercel.app'
  })
  const authError = document.getElementById('authError')
  authError.classList.remove('hidden')
  if (error) {
    authError.textContent = error.message
    authError.style.color = '#e53e3e'
  } else {
    authError.textContent = 'Password reset email sent.'
    authError.style.color = '#1db954'
  }
})

  // Bug 3 fix — surprise button listener stays, but button starts hidden
  // and is only revealed after a successful search (inside setupFindButton)
  document.getElementById('surpriseBtn').addEventListener('click', async () => {
    const surpriseBtn = document.getElementById('surpriseBtn')
    surpriseBtn.textContent = 'Finding somewhere new...'
    surpriseBtn.disabled = true
    clearMarkers()

    const recRes = await fetch('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        places: lastPlaces,
        situation: lastSituation,
        exclude: shownPlaceNames.join(', ')
      })
    })
    const recData = await recRes.json()

    if (recData.recommendations?.length) {
      displayResults(recData.recommendations, lastPlaces)
      recData.recommendations.forEach(r => shownPlaceNames.push(r.name))
    } else {
      showError('No more new places found nearby.')
    }

    surpriseBtn.textContent = 'Take me somewhere different →'
    surpriseBtn.disabled = false
  })
})

function initMap(lat, lng) {
  map = new maplibregl.Map({
    container: 'map',
    style: 'https://tiles.openfreemap.org/styles/dark',
    center: [lng, lat],
    zoom: 14
  })

  map.on('load', () => {
    new maplibregl.Marker({ color: '#ffffff' })
      .setLngLat([lng, lat])
      .addTo(map)
  })
}

function setupChips() {
  document.querySelectorAll('.chips').forEach(group => {
    group.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        group.querySelectorAll('.chip').forEach(c => c.classList.remove('active'))
        chip.classList.add('active')
      })
    })
  })
}

function getSituation() {
  const who = document.querySelector('.chips[data-group="who"] .chip.active')?.dataset.value
  const need = document.querySelector('.chips[data-group="need"] .chip.active')?.dataset.value
  const time = document.querySelector('.chips[data-group="time"] .chip.active')?.dataset.value
  const energy = document.querySelector('.chips[data-group="energy"] .chip.active')?.dataset.value
  return `${who}, ${need}, ${time}, ${energy}`
}

function setupFindButton() {
  const findBtn = document.getElementById('findBtn')
  const results = document.getElementById('results')
  const skeleton = document.getElementById('skeleton')
  const surpriseBtn = document.getElementById('surpriseBtn')

  findBtn.addEventListener('click', async () => {
    const situation = getSituation()

    findBtn.disabled = true
    findBtn.textContent = 'Finding...'
    results.classList.add('hidden')
    results.innerHTML = ''
    surpriseBtn.classList.add('hidden')  // Bug 3 fix — hide on new search
    skeleton.classList.remove('hidden')
    clearMarkers()

    try {
      const placesRes = await fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: userLat,
          longitude: userLng,
          situation
        })
      })
      const placesData = await placesRes.json()

      lastPlaces = placesData.places
      lastSituation = situation
      shownPlaceNames = []

      if (!placesData.places?.length) {
        skeleton.classList.add('hidden')
        showError('No open places found nearby right now.')
        return
      }

      const recRes = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ places: placesData.places, situation })
      })
      const recData = await recRes.json()

      skeleton.classList.add('hidden')

      if (!recData.recommendations?.length) {
        showError('Could not find a match. Try different options.')
        return
      }

      displayResults(recData.recommendations, placesData.places)
      recData.recommendations.forEach(r => shownPlaceNames.push(r.name))
      surpriseBtn.classList.remove('hidden')  // Bug 3 fix — only show after results

    } catch (error) {
      skeleton.classList.add('hidden')
      showError('Something went wrong. Please try again.')
    } finally {
      findBtn.disabled = false
      findBtn.textContent = 'Find my place'
    }
  })
}

function displayResults(recommendations, allPlaces) {
  const results = document.getElementById('results')
  results.innerHTML = ''

  recommendations.forEach((rec) => {
    const distanceText = rec.distance
      ? rec.distance < 1000
        ? `${rec.distance}m away`
        : `${(rec.distance / 1000).toFixed(1)}km away`
      : ''

    const card = document.createElement('div')
    card.className = 'result-card'
    card.innerHTML = `
      <div class="result-header-row">
        <div class="result-name">${rec.name}</div>
        <div class="result-badges">
          <span class="open-badge">open</span>
          <button class="save-btn">♡</button>
        </div>
      </div>
      <div class="result-reason">${rec.reason}</div>
      <div class="result-meta">
        <span class="result-badge">${rec.type || 'cafe'}</span>
        ${rec.rating ? `<span>★ ${rec.rating}</span>` : ''}
        ${distanceText ? `<span>${distanceText}</span>` : ''}
      </div>
      ${rec.opening_hours ? `<div style="font-size:0.65rem;font-family:var(--mono);color:#383838;margin-bottom:7px;">${rec.opening_hours.split(',')[0]}</div>` : ''}
      <a class="maps-link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(rec.name + ' ' + (rec.address || ''))}" target="_blank" onclick="event.stopPropagation()">
        directions →
      </a>
    `

    const saveBtn = card.querySelector('.save-btn')
    saveBtn.addEventListener('click', async (e) => {
      e.stopPropagation()
      await savePlace(rec, saveBtn)
    })

    card.addEventListener('click', () => {
      if (rec.latitude && rec.longitude) {
        map.flyTo({ center: [rec.longitude, rec.latitude], zoom: 16 })
      }
    })

    results.appendChild(card)

    if (rec.latitude && rec.longitude) {
      const marker = new maplibregl.Marker({ color: '#19bd52' })
        .setLngLat([rec.longitude, rec.latitude])
        .addTo(map)
      markers.push(marker)
    }
  })

  results.classList.remove('hidden')
}

function clearMarkers() {
  markers.forEach(m => m.remove())
  markers = []
}

function showError(message) {
  const results = document.getElementById('results')
  results.innerHTML = `<p class="error-msg">${message}</p>`
  results.classList.remove('hidden')
  document.getElementById('findBtn').disabled = false
  document.getElementById('findBtn').textContent = 'Find my place'
}

async function savePlace(rec, btn) {
  if (!currentUser) {
    document.getElementById('authPanel').classList.remove('hidden')
    return
  }

  const { error } = await supabase.from('saved_places').insert({
    user_id: currentUser.id,
    name: rec.name,
    type: rec.type,
    address: rec.address,
    latitude: rec.latitude,
    longitude: rec.longitude,
    rating: rec.rating,
    distance: rec.distance,
    opening_hours: rec.opening_hours
  })

  if (!error) {
    btn.textContent = '♥'
    btn.style.color = '#19bd52'
  }
}