import { supabase } from './supabase.js'

let currentUser = null
let map
let mapReady = false
let userLat
let userLng
let markers = []
let shownPlaceNames = []
let isFinding = false
let lastPlaces = []
let lastSituation = ''
let savedPlacesLoadedForUserId = null
let savedPlaceNames = new Set()
let savedPlaceKeys = new Set()
const FALLBACK_LOCATION = { lat: 27.7172, lng: 85.324 }
const PHOTO_CACHE_KEY = 'third-photo-cache'
const TYPE_META = {
  cafe: { icon: '&#9749;', label: 'Coffee' },
  coffee_shop: { icon: '&#9749;', label: 'Coffee' },
  restaurant: { icon: '&#127869;', label: 'Restaurant' },
  bakery: { icon: '&#129360;', label: 'Bakery' },
  bar: { icon: '&#127864;', label: 'Bar' },
  wine_bar: { icon: '&#127863;', label: 'Wine bar' },
  pub: { icon: '&#127866;', label: 'Pub' }
}

document.addEventListener('DOMContentLoaded', async () => {
  const mapEl = document.getElementById('map')
  const headerEl = document.getElementById('header')
  const panelEl = document.getElementById('panel')

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
      userLat = FALLBACK_LOCATION.lat
      userLng = FALLBACK_LOCATION.lng
      initMap(FALLBACK_LOCATION.lat, FALLBACK_LOCATION.lng)
    }
  )

  setupChips()
  setupFindButton()

  supabase.auth.onAuthStateChange(async (event, session) => {
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
        await loadSavedPlaces({ renderDropdown: false })
      }
      refreshSaveButtons()
    } else {
      userLabel.textContent = ''
      userMenu.classList.add('hidden')
      authBtn.textContent = 'Sign in'
      authPanel.classList.add('hidden')
      resetSavedPlacesDropdown()
      savedPlaceNames = new Set()
      savedPlaceKeys = new Set()
      refreshSaveButtons()
    }
  })

  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (session?.user) {
      currentUser = session.user
      document.getElementById('userLabel').textContent = session.user.email?.split('@')[0] || ''
      document.getElementById('userMenu').classList.remove('hidden')
      document.getElementById('authBtn').textContent = 'Sign out'
      document.getElementById('authPanel').classList.add('hidden')
      await loadSavedPlaces({ renderDropdown: false })
      refreshSaveButtons()
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
      const recData = await fetchRecommendations(lastPlaces, lastSituation, shownPlaceNames.join(', '))
      const recommendations = recData.recommendations || []

      if (recommendations.length) {
        displayResults(recommendations)
        recommendations.forEach((recommendation) => shownPlaceNames.push(recommendation.name))
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
      await loadSavedPlaces({ renderDropdown: true })
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

async function loadSavedPlaces({ renderDropdown = true } = {}) {
  if (!currentUser) {
    return []
  }

  const content = document.getElementById('savedPlacesContent')
  if (renderDropdown) {
    content.innerHTML = '<div class="saved-dropdown-state">Loading...</div>'
  }

  const { data, error } = await supabase
    .from('saved_places')
    .select('id, name, type, address, latitude, longitude, rating, distance')
    .eq('user_id', currentUser.id)
    .order('name', { ascending: true })

  if (error) {
    if (renderDropdown) {
      content.innerHTML = '<div class="saved-dropdown-state">Could not load saved places.</div>'
    }
    return []
  }

  const places = dedupeSavedPlaces(data || []).map((place) => ({
    ...place,
    photo_url: getCachedPhotoUrl(place.name, place.address)
  }))
  savedPlacesLoadedForUserId = currentUser.id
  savedPlaceNames = new Set(places.map((place) => place.name))
  savedPlaceKeys = new Set(places.map((place) => makeSavedKey(place.name, place.address)))

  if (renderDropdown) {
    renderSavedPlaces(places)
  }

  return places
}

function renderSavedPlaces(places) {
  const content = document.getElementById('savedPlacesContent')

  if (!places.length) {
    content.innerHTML = '<div class="saved-place-empty">No saved places yet.</div>'
    return
  }

  content.innerHTML = ''

  places.forEach((place) => {
    const item = document.createElement('div')
    item.className = 'saved-place-item'

    const details = document.createElement('button')
    details.type = 'button'
    details.className = 'saved-place-button'

    const metaBits = []
    const typeMeta = getTypeMeta(place)
    metaBits.push(`${typeMeta.icon} ${typeMeta.label}`)
    if (place.rating) {
      metaBits.push(place.rating)
    }
    if (place.distance) {
      metaBits.push(formatDistance(place.distance))
    }

    details.innerHTML = `
      <div class="saved-place-thumb${place.photo_url ? '' : ' no-photo'}">
        ${place.photo_url ? `<img class="saved-place-thumb-image" src="${place.photo_url}" alt="${place.name}">` : `<div class="saved-place-thumb-fallback">${typeMeta.icon}</div>`}
      </div>
      <div class="saved-place-text">
        <div class="saved-place-name">${place.name}</div>
        <div class="saved-place-meta">${metaBits.map((bit) => `<span>${bit}</span>`).join('')}</div>
      </div>
    `

    details.addEventListener('click', () => {
      closeSavedPlacesDropdown()
      showSavedPlacePreview(place)
    })

    const removeButton = document.createElement('button')
    removeButton.type = 'button'
    removeButton.className = 'saved-place-remove'
    removeButton.textContent = 'Remove'
    removeButton.addEventListener('click', async (event) => {
      event.stopPropagation()
      removeButton.disabled = true
      removeButton.textContent = 'Removing...'
      await removeSavedPlace(place.id)
    })

    item.appendChild(details)
    item.appendChild(removeButton)
    content.appendChild(item)
  })
}

async function removeSavedPlace(placeId) {
  if (!currentUser || !placeId) {
    return
  }

  const { error } = await supabase
    .from('saved_places')
    .delete()
    .eq('id', placeId)
    .eq('user_id', currentUser.id)

  if (error) {
    const content = document.getElementById('savedPlacesContent')
    content.insertAdjacentHTML('afterbegin', '<div class="saved-dropdown-state">Could not remove saved place.</div>')
    return
  }

  savedPlacesLoadedForUserId = null
  await loadSavedPlaces({ renderDropdown: true })
  refreshSaveButtons()
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
  try {
    map = new maplibregl.Map({
      container: 'map',
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: {
              'background-color': '#101010'
            }
          }
        ]
      },
      center: [lng, lat],
      zoom: 14
    })

    mapReady = false

    map.on('load', () => {
      mapReady = true
      new maplibregl.Marker({ color: '#ffffff' })
        .setLngLat([lng, lat])
        .addTo(map)
    })

    map.on('error', (event) => {
      console.warn('Map warning:', event?.error || event)
    })
  } catch (error) {
    map = null
    mapReady = false
    console.warn('Map failed to initialize:', error)
  }
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

  const handleFindPlace = async () => {
    if (isFinding) {
      return
    }

    isFinding = true

    if (!Number.isFinite(userLat) || !Number.isFinite(userLng)) {
      userLat = FALLBACK_LOCATION.lat
      userLng = FALLBACK_LOCATION.lng
    }

    if (currentUser && savedPlacesLoadedForUserId !== currentUser.id) {
      await loadSavedPlaces({ renderDropdown: false })
    }

    const situation = getSituation()
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 12000)

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
        }),
        signal: controller.signal
      })
      const placesData = await placesRes.json().catch(() => ({}))

      if (!placesRes.ok) {
        throw new Error(placesData.error || 'Could not fetch nearby places.')
      }

      lastPlaces = placesData.places || []
      lastSituation = situation
      shownPlaceNames = []
      cachePlacePhotos(lastPlaces)

      if (!lastPlaces.length) {
        skeleton.classList.add('hidden')
        showError('No open places found nearby right now.')
        return
      }

      const recData = await fetchRecommendations(lastPlaces, situation)
      const recommendations = recData.recommendations || []

      skeleton.classList.add('hidden')

      if (!recommendations.length) {
        showError('Could not find a match. Try different options.')
        return
      }

      cachePlacePhotos(recommendations)
      displayResults(recommendations)
      recommendations.forEach((recommendation) => shownPlaceNames.push(recommendation.name))
      surpriseBtn.classList.remove('hidden')
    } catch (error) {
      skeleton.classList.add('hidden')
      const message = error?.name === 'AbortError'
        ? 'Search took too long. Please try again.'
        : (error.message || 'Something went wrong. Please try again.')
      showError(message)
    } finally {
      window.clearTimeout(timeout)
      findBtn.disabled = false
      findBtn.textContent = 'Find my place'
      isFinding = false
    }
  }

  findBtn.onclick = handleFindPlace
  window.handleFindPlace = handleFindPlace
}

async function fetchRecommendations(places, situation, exclude = '') {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 12000)

  try {
    const recRes = await fetch('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ places, situation, exclude }),
      signal: controller.signal
    })

    const recData = await recRes.json().catch(() => ({}))

    if (!recRes.ok) {
      throw new Error(recData.error || 'Could not generate recommendations.')
    }

    return recData
  } catch (error) {
    console.warn('Falling back to local recommendations:', error)
    return { recommendations: pickFallbackRecommendations(places, situation, exclude) }
  } finally {
    window.clearTimeout(timeout)
  }
}

function pickFallbackRecommendations(places, situation, exclude = '') {
  const excludedNames = new Set(
    String(exclude || '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
  )
  const need = String(situation || '').toLowerCase()

  return [...places]
    .filter((place) => !excludedNames.has(place.name))
    .map((place) => ({
      ...place,
      _score: scorePlace(place, need),
      reason: buildFallbackReason(place, need)
    }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 3)
    .map(({ _score, ...place }) => place)
}

function scorePlace(place, need) {
  let score = 0
  const type = String(place.primary_type || place.type || '').toLowerCase()
  const rating = Number(place.rating) || 0
  const distance = Number(place.distance) || 0
  const reviews = Number(place.total_ratings) || 0

  score += rating * 20
  score += Math.min(reviews / 40, 12)
  score += Math.max(0, 18 - distance / 120)

  if (type.includes('cafe') || type.includes('coffee')) score += 18
  if (type.includes('bakery')) score += 8
  if (type.includes('restaurant')) score += need.includes('food') ? 10 : -6
  if (type.includes('bar') || type.includes('pub') || type.includes('wine')) score += need.includes('drink') ? 12 : -4
  if (need.includes('work') && (type.includes('cafe') || type.includes('coffee'))) score += 12
  if (need.includes('chill') && place.is_open !== false) score += 6
  if (need.includes('quick') && distance < 900) score += 8

  return score
}

function buildFallbackReason(place, need) {
  const typeMeta = getTypeMeta(place)
  const ratingText = place.rating ? `${place.rating}` : 'a solid'
  const distanceText = place.distance ? formatDistance(place.distance) : 'nearby'

  if (need.includes('work')) {
    return `${typeMeta.label} spot with a ${ratingText} rating and an easy ${distanceText} trip for settling in.`
  }

  if (need.includes('drink')) {
    return `Good fit for drinks and conversation with a ${ratingText} rating and a ${distanceText} trip.`
  }

  if (need.includes('food')) {
    return `Comfortable option for hanging out over food, with a ${ratingText} rating and a ${distanceText} trip.`
  }

  return `Easy place to spend time, with a ${ratingText} rating and a ${distanceText} trip.`
}
function displayResults(recommendations) {
  const results = document.getElementById('results')
  results.innerHTML = ''

  recommendations.forEach((rec) => {
    const typeMeta = getTypeMeta(rec)
    const timingText = getTimingText(rec)
    const savedKey = makeSavedKey(rec.name, rec.address)
    const isSavedByKey = currentUser && savedPlaceKeys.has(savedKey)
    const showSaveButton = Boolean(currentUser)
    const card = document.createElement('article')
    card.className = 'result-card'
    const directionsUrl = getDirectionsUrl(rec)

    card.innerHTML = `
      <div class="result-media${rec.photo_url ? '' : ' no-photo'}">
        ${rec.photo_url ? `<img class="result-image" src="${rec.photo_url}" alt="${rec.name}">` : `<div class="result-image-placeholder">${typeMeta.icon}</div>`}
      </div>
      <div class="result-content">
        <div class="result-header-row">
          <div>
            ${rec.preview_source === 'saved' ? '<div class="result-origin-badge">From saved places</div>' : ''}
            <div class="result-name">${rec.name}</div>
            <div class="result-subline">${rec.reason}</div>
          </div>
          ${showSaveButton ? `<button class="save-btn${isSavedByKey ? ' saved' : ''}" data-place-key="${escapeAttribute(savedKey)}">${isSavedByKey ? 'Saved' : 'Save'}</button>` : ''}
        </div>
        <div class="result-chip-row">
          <span class="result-pill type-pill">${typeMeta.icon} ${typeMeta.label}</span>
          ${rec.rating ? `<span class="result-pill">${rec.rating}</span>` : ''}
          ${rec.distance ? `<span class="result-pill">${formatDistance(rec.distance)}</span>` : ''}
        </div>
        ${timingText ? `<div class="result-timing">${timingText}</div>` : ''}
        <div class="result-footer">
          <div class="result-address">${rec.address || ''}</div>
          <div class="result-tap-hint">Tap card for directions</div>
        </div>
      </div>
    `

    const saveBtn = card.querySelector('.save-btn')
    if (saveBtn) {
      updateSaveButtonState(saveBtn, isSavedByKey)
      saveBtn.addEventListener('click', async (event) => {
        event.stopPropagation()
        await savePlace(rec, saveBtn)
      })
    }

    card.addEventListener('click', () => {
      window.open(directionsUrl, '_blank', 'noopener,noreferrer')
    })

    results.appendChild(card)

    if (mapReady && map && Number.isFinite(rec.latitude) && Number.isFinite(rec.longitude)) {
      const marker = new maplibregl.Marker({ color: '#19bd52' })
        .setLngLat([rec.longitude, rec.latitude])
        .addTo(map)
      markers.push(marker)
    }
  })

  results.classList.remove('hidden')
}

function getTypeMeta(place) {
  const typeKey = place.primary_type || place.type || 'cafe'
  return TYPE_META[typeKey] || { icon: '&#128205;', label: place.type || 'Place' }
}

function getTimingText(place) {
  const descriptions = place.current_opening_hours || place.opening_hours
  const openNow = place.is_open

  if (!Array.isArray(descriptions) || !descriptions.length) {
    return openNow === true ? 'Open now' : ''
  }

  const todayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date())
  const todayDescription = descriptions.find((line) => line.startsWith(todayName)) || descriptions[0]
  const hoursText = (todayDescription.split(': ').slice(1).join(': ') || '').trim()

  if (!hoursText || hoursText.toLowerCase() === 'closed') {
    return openNow === false ? 'Closed now' : ''
  }

  if (openNow === true) {
    const matches = hoursText.match(/\d{1,2}:\d{2}\s?[AP]M/gi) || []
    const closePart = matches[matches.length - 1] || hoursText.split('–').pop()?.trim() || hoursText.split('-').pop()?.trim()
    return closePart ? `Closes at ${closePart}` : 'Open now'
  }

  return `Hours today ${hoursText}`
}

function formatDistance(distance) {
  return distance < 1000 ? `${distance}m` : `${(distance / 1000).toFixed(1)}km`
}

function refreshSaveButtons() {
  document.querySelectorAll('.save-btn[data-place-key]').forEach((button) => {
    const placeKey = button.dataset.placeKey
    const isSaved = currentUser && savedPlaceKeys.has(placeKey)
    updateSaveButtonState(button, isSaved)
  })
}

function updateSaveButtonState(button, isSaved) {
  button.textContent = isSaved ? 'Saved' : 'Save'
  button.classList.toggle('saved', Boolean(isSaved))
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

  const savedKey = makeSavedKey(rec.name, rec.address)

  if (savedPlaceKeys.has(savedKey)) {
    updateSaveButtonState(btn, true)
    return
  }

  btn.disabled = true

  const { data: existingSave, error: existingError } = await supabase
    .from('saved_places')
    .select('id')
    .eq('user_id', currentUser.id)
    .eq('name', rec.name)
    .eq('address', rec.address || '')
    .limit(1)

  if (!existingError && existingSave?.length) {
    btn.disabled = false
    savedPlaceNames.add(rec.name)
    savedPlaceKeys.add(savedKey)
    cachePlacePhoto(rec)
    updateSaveButtonState(btn, true)
    return
  }

  const { error } = await supabase.from('saved_places').insert({
    user_id: currentUser.id,
    name: rec.name,
    type: rec.type,
    address: rec.address || '',
    latitude: rec.latitude,
    longitude: rec.longitude,
    rating: rec.rating,
    distance: rec.distance,
    opening_hours: Array.isArray(rec.opening_hours) ? rec.opening_hours.join(', ') : rec.opening_hours
  })

  btn.disabled = false

  if (!error) {
    savedPlacesLoadedForUserId = null
    savedPlaceNames.add(rec.name)
    savedPlaceKeys.add(savedKey)
    cachePlacePhoto(rec)
    updateSaveButtonState(btn, true)
  }
}

function showSavedPlacePreview(place) {
  const preview = {
    ...place,
    reason: 'Saved place ready to revisit.',
    photo_url: place.photo_url || getCachedPhotoUrl(place.name, place.address),
    primary_type: place.primary_type || place.type,
    preview_source: 'saved'
  }

  clearMarkers()
  displayResults([preview])
  document.getElementById('surpriseBtn').classList.add('hidden')

  if (mapReady && map && Number.isFinite(place.latitude) && Number.isFinite(place.longitude)) {
    map.flyTo({ center: [place.longitude, place.latitude], zoom: 16 })
    const marker = new maplibregl.Marker({ color: '#19bd52' })
      .setLngLat([place.longitude, place.latitude])
      .addTo(map)
    markers.push(marker)
  }

  const results = document.getElementById('results')
  const previewCard = results.querySelector('.result-card')

  if (previewCard) {
    requestAnimationFrame(() => {
      previewCard.classList.add('result-card-preview')
      previewCard.scrollIntoView({ behavior: 'smooth', block: 'center' })

      window.setTimeout(() => {
        previewCard.classList.remove('result-card-preview')
      }, 900)
    })
  } else {
    results.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function dedupeSavedPlaces(places) {
  const byKey = new Map()

  places.forEach((place) => {
    const key = makeSavedKey(place.name, place.address)
    if (!byKey.has(key)) {
      byKey.set(key, place)
    }
  })

  return Array.from(byKey.values())
}

function cachePlacePhotos(places) {
  places.forEach((place) => cachePlacePhoto(place))
}

function cachePlacePhoto(place) {
  if (!place?.photo_url) {
    return
  }

  try {
    const cache = readPhotoCache()
    cache[makeSavedKey(place.name, place.address)] = place.photo_url
    localStorage.setItem(PHOTO_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Ignore storage issues and continue without cached thumbnails.
  }
}

function getCachedPhotoUrl(name, address) {
  try {
    const cache = readPhotoCache()
    return cache[makeSavedKey(name, address)] || null
  } catch {
    return null
  }
}

function readPhotoCache() {
  const raw = localStorage.getItem(PHOTO_CACHE_KEY)
  return raw ? JSON.parse(raw) : {}
}

function getDirectionsUrl(place) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + ' ' + (place.address || ''))}`
}

function makeSavedKey(name, address) {
  return `${name}::${address || ''}`
}

function escapeAttribute(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}












