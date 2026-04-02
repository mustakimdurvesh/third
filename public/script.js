import { supabase } from './supabase.js'

let currentUser = null
let map
let userLat
let userLng
let markers = []
let shownPlaceNames = []
let lastPlaces = []
let lastSituation = ''
let savedPlacesLoadedForUserId = null
const FALLBACK_LOCATION = { lat: 27.7172, lng: 85.324 }

document.addEventListener('DOMContentLoaded', async () => {
  const mapEl = document.getElementById('map')
  const headerEl = document.getElementById('header')
  const panelEl = document.getElementById('panel')

  const mapHeight = window.innerHeight - headerEl.offsetHeight - panelEl.offsetHeight
  mapEl.style.height = mapHeight + 'px'

  setupUserMenu()

  const hash = window.location.hash
  if (hash.includes('type=recovery')) {
    const params = new URLSearchParams(hash.slice(1))
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    if (accessToken && refreshToken) {
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      })

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
    } else {
      alert('Your password reset link is incomplete. Please request a new one.')
    }
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      userLat = position.coords.latitude
      userLng = position.coords.longitude
      initMap(userLat, userLng)
    },
    () => {
      initMap(FALLBACK_LOCATION.lat, FALLBACK_LOCATION.lng)
      showError('Enable location access to search nearby places.')
    }
  )

  setupChips()
  setupFindButton()

  supabase.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null
    const userLabel = document.getElementById('userLabel')
    const userMenu = document.getElementById('userMenu')
    const authBtn = document.getElementById('authBtn')
    const authPanel = document.getElementById('authPanel')
    const authError = document.getElementById('authError')

    if (currentUser) {
      userLabel.textContent = currentUser.email?.split('@')[0] || ''
      userMenu.classList.remove('hidden')
      authBtn.textContent = 'Sign out'
      authPanel.classList.add('hidden')
      authError.textContent = ''
      authError.classList.add('hidden')
      if (savedPlacesLoadedForUserId !== currentUser.id) {
        resetSavedPlacesDropdown()
      }
    } else {
      userLabel.textContent = ''
      userMenu.classList.add('hidden')
      authBtn.textContent = 'Sign in'
      authPanel.classList.add('hidden')
      resetSavedPlacesDropdown()
    }
  })

  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) {
      currentUser = session.user
      document.getElementById('userLabel').textContent = session.user.email?.split('@')[0] || ''
      document.getElementById('userMenu').classList.remove('hidden')
      document.getElementById('authBtn').textContent = 'Sign out'
      document.getElementById('authPanel').classList.add('hidden')
    }
  })

  document.getElementById('authBtn').addEventListener('click', async () => {
    if (currentUser) {
      closeSavedPlacesDropdown()
      await supabase.auth.signOut()
    } else {
      document.getElementById('authPanel').classList.remove('hidden')
    }
  })

  document.getElementById('signInBtn').addEventListener('click', async () => {
    const email = document.getElementById('emailInput').value.trim()
    const password = document.getElementById('passwordInput').value.trim()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      showAuthMessage(error.message, '#e53e3e')
    }
  })

  document.getElementById('signUpBtn').addEventListener('click', async () => {
    const email = document.getElementById('emailInput').value.trim()
    const password = document.getElementById('passwordInput').value.trim()
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      showAuthMessage(error.message, '#e53e3e')
    } else {
      showAuthMessage('Check your email to confirm.', '#1db954')
    }
  })

  document.getElementById('forgotBtn').addEventListener('click', async () => {
    const btn = document.getElementById('forgotBtn')
    btn.disabled = true
    btn.textContent = 'Email sent - wait 60s'

    setTimeout(() => {
      btn.disabled = false
      btn.textContent = 'Forgot password?'
    }, 60000)

    const email = document.getElementById('emailInput').value.trim()
    if (!email) {
      showAuthMessage('Enter your email first.', '#e53e3e')
      btn.disabled = false
      btn.textContent = 'Forgot password?'
      return
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    })

    if (error) {
      showAuthMessage(error.message, '#e53e3e')
    } else {
      showAuthMessage('Password reset email sent.', '#1db954')
    }
  })

  document.getElementById('surpriseBtn').addEventListener('click', async () => {
    const surpriseBtn = document.getElementById('surpriseBtn')
    surpriseBtn.textContent = 'Finding somewhere new...'
    surpriseBtn.disabled = true
    clearMarkers()

    try {
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
        displayResults(recData.recommendations)
        recData.recommendations.forEach((recommendation) => shownPlaceNames.push(recommendation.name))
      } else {
        showError('No more new places found nearby.')
      }
    } catch (error) {
      showError('Something went wrong while finding a new place.')
    } finally {
      surpriseBtn.textContent = 'Take me somewhere different ->'
      surpriseBtn.disabled = false
    }
  })
})

function setupUserMenu() {
  const userMenu = document.getElementById('userMenu')
  const toggle = document.getElementById('userMenuToggle')

  toggle.addEventListener('click', async (event) => {
    event.stopPropagation()

    if (!currentUser) {
      return
    }

    const willOpen = document.getElementById('savedPlacesDropdown').classList.contains('hidden')
    if (willOpen) {
      openSavedPlacesDropdown()
      await loadSavedPlaces()
    } else {
      closeSavedPlacesDropdown()
    }
  })

  userMenu.addEventListener('click', (event) => {
    event.stopPropagation()
  })

  document.addEventListener('click', () => {
    closeSavedPlacesDropdown()
  })
}

async function loadSavedPlaces() {
  if (!currentUser) {
    return
  }

  const content = document.getElementById('savedPlacesContent')
  content.innerHTML = '<div class="saved-dropdown-state">Loading...</div>'

  const { data, error } = await supabase
    .from('saved_places')
    .select('name, type, address, latitude, longitude, rating, distance')
    .eq('user_id', currentUser.id)
    .order('name', { ascending: true })

  if (error) {
    content.innerHTML = '<div class="saved-dropdown-state">Could not load saved places.</div>'
    return
  }

  savedPlacesLoadedForUserId = currentUser.id
  renderSavedPlaces(data || [])
}

function renderSavedPlaces(places) {
  const content = document.getElementById('savedPlacesContent')

  if (!places.length) {
    content.innerHTML = '<div class="saved-place-empty">No saved places yet.</div>'
    return
  }

  content.innerHTML = ''

  places.forEach((place) => {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'saved-place-item'

    const metaBits = []
    if (place.type) {
      metaBits.push(place.type)
    }
    if (place.rating) {
      metaBits.push(`Rating ${place.rating}`)
    }
    if (place.distance) {
      metaBits.push(place.distance < 1000 ? `${place.distance}m away` : `${(place.distance / 1000).toFixed(1)}km away`)
    }

    item.innerHTML = `
      <div class="saved-place-name">${place.name}</div>
      <div class="saved-place-meta">${metaBits.map((bit) => `<span>${bit}</span>`).join('')}</div>
    `

    item.addEventListener('click', () => {
      closeSavedPlacesDropdown()
      if (Number.isFinite(place.latitude) && Number.isFinite(place.longitude) && map) {
        map.flyTo({ center: [place.longitude, place.latitude], zoom: 16 })
      }
    })

    content.appendChild(item)
  })
}

function openSavedPlacesDropdown() {
  const dropdown = document.getElementById('savedPlacesDropdown')
  const toggle = document.getElementById('userMenuToggle')
  dropdown.classList.remove('hidden')
  toggle.setAttribute('aria-expanded', 'true')
}

function closeSavedPlacesDropdown() {
  const dropdown = document.getElementById('savedPlacesDropdown')
  const toggle = document.getElementById('userMenuToggle')
  dropdown.classList.add('hidden')
  toggle.setAttribute('aria-expanded', 'false')
}

function resetSavedPlacesDropdown() {
  savedPlacesLoadedForUserId = null
  closeSavedPlacesDropdown()
  document.getElementById('savedPlacesContent').innerHTML = ''
}

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
  document.querySelectorAll('.chips').forEach((group) => {
    group.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        group.querySelectorAll('.chip').forEach((button) => button.classList.remove('active'))
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
    if (!Number.isFinite(userLat) || !Number.isFinite(userLng)) {
      showError('Location is still unavailable. Please enable location access and try again.')
      return
    }

    const situation = getSituation()

    findBtn.disabled = true
    findBtn.textContent = 'Finding...'
    results.classList.add('hidden')
    results.innerHTML = ''
    surpriseBtn.classList.add('hidden')
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

      if (!placesRes.ok) {
        throw new Error(placesData.error || 'Could not fetch nearby places.')
      }

      lastPlaces = placesData.places || []
      lastSituation = situation
      shownPlaceNames = []

      if (!lastPlaces.length) {
        skeleton.classList.add('hidden')
        showError('No open places found nearby right now.')
        return
      }

      const recRes = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ places: lastPlaces, situation })
      })
      const recData = await recRes.json()

      if (!recRes.ok) {
        throw new Error(recData.error || 'Could not generate recommendations.')
      }

      skeleton.classList.add('hidden')

      if (!recData.recommendations?.length) {
        showError('Could not find a match. Try different options.')
        return
      }

      displayResults(recData.recommendations)
      recData.recommendations.forEach((recommendation) => shownPlaceNames.push(recommendation.name))
      surpriseBtn.classList.remove('hidden')
    } catch (error) {
      skeleton.classList.add('hidden')
      showError(error.message || 'Something went wrong. Please try again.')
    } finally {
      findBtn.disabled = false
      findBtn.textContent = 'Find my place'
    }
  })
}

function displayResults(recommendations) {
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
          <button class="save-btn">Save</button>
        </div>
      </div>
      <div class="result-reason">${rec.reason}</div>
      <div class="result-meta">
        <span class="result-badge">${rec.type || 'cafe'}</span>
        ${rec.rating ? `<span>Rating ${rec.rating}</span>` : ''}
        ${distanceText ? `<span>${distanceText}</span>` : ''}
      </div>
      ${rec.opening_hours ? `<div style="font-size:0.65rem;font-family:var(--mono);color:#383838;margin-bottom:7px;">${rec.opening_hours.split(',')[0]}</div>` : ''}
      <a class="maps-link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(rec.name + ' ' + (rec.address || ''))}" target="_blank" rel="noreferrer" onclick="event.stopPropagation()">
        directions ->
      </a>
    `

    const saveBtn = card.querySelector('.save-btn')
    saveBtn.addEventListener('click', async (event) => {
      event.stopPropagation()
      await savePlace(rec, saveBtn)
    })

    card.addEventListener('click', () => {
      if (Number.isFinite(rec.latitude) && Number.isFinite(rec.longitude)) {
        map.flyTo({ center: [rec.longitude, rec.latitude], zoom: 16 })
      }
    })

    results.appendChild(card)

    if (Number.isFinite(rec.latitude) && Number.isFinite(rec.longitude)) {
      const marker = new maplibregl.Marker({ color: '#19bd52' })
        .setLngLat([rec.longitude, rec.latitude])
        .addTo(map)
      markers.push(marker)
    }
  })

  results.classList.remove('hidden')
}

function clearMarkers() {
  markers.forEach((marker) => marker.remove())
  markers = []
}

function showError(message) {
  const results = document.getElementById('results')
  results.innerHTML = `<p class="error-msg">${message}</p>`
  results.classList.remove('hidden')
  document.getElementById('findBtn').disabled = false
  document.getElementById('findBtn').textContent = 'Find my place'
}

function showAuthMessage(message, color) {
  const authError = document.getElementById('authError')
  authError.textContent = message
  authError.style.color = color
  authError.classList.remove('hidden')
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
    savedPlacesLoadedForUserId = null
    btn.textContent = 'Saved'
    btn.style.color = '#19bd52'
  }
}
