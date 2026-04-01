import {
  supabase
} from './supabase.js'

let currentUser = null
let map
//let userLat = 27.7172
//let userLng = 85.3240
let userLat
let userLng
let markers = []
let shownPlaceNames = []
let lastPlaces = []
let lastSituation = ''



document.addEventListener('DOMContentLoaded', () => {
  const mapEl = document.getElementById('map')
  const headerEl = document.getElementById('header')
  const panelEl = document.getElementById('panel')

  const mapHeight = window.innerHeight -
    headerEl.offsetHeight -
    panelEl.offsetHeight
  mapEl.style.height = mapHeight + 'px'

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
  //Supabase auth state handler
  supabase.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null
    const userLabel = document.getElementById('userLabel')
    const authBtn = document.getElementById('authBtn')
    const authPanel = document.getElementById('authPanel')
    if (currentUser) {
      userLabel.textContent = currentUser.email.split('@')[0]
      authBtn.textContent = 'Sign out'
      authPanel.classList.add('hidden')
    } else {
      userLabel.textContent = ''
      authBtn.textContent = 'Sign in'
    }
  })

  supabase.auth.getSession().then(({
    data: {
      session
    }
  }) => {
    if (session?.user) {
      currentUser = session.user
      document.getElementById('userLabel').textContent = session.user.email.split('@')[0]
      document.getElementById('authBtn').textContent = 'Sign out'
      document.getElementById('authPanel').classList.add('hidden') //fix for hiding signin banner after login
    }
  })

  document.getElementById('authBtn').addEventListener('click', async () => {
    if (currentUser) {
      await supabase.auth.signOut()
    } else {
      document.getElementById('authPanel').classList.toggle('hidden')
    }
  })

  document.getElementById('signInBtn').addEventListener('click', async () => {
    const email = document.getElementById('emailInput').value.trim()
    const password = document.getElementById('passwordInput').value.trim()
    const {
      error
    } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    if (error) {
      document.getElementById('authError').textContent = error.message
      document.getElementById('authError').classList.remove('hidden')
    }
  })

  document.getElementById('signUpBtn').addEventListener('click', async () => {
    const email = document.getElementById('emailInput').value.trim()
    const password = document.getElementById('passwordInput').value.trim()
    const {
      error
    } = await supabase.auth.signUp({
      email,
      password
    })
    if (error) {
      document.getElementById('authError').textContent = error.message
      document.getElementById('authError').classList.remove('hidden')
    } else {
      document.getElementById('authError').textContent = 'Check your email to confirm.'
      document.getElementById('authError').style.color = '#19bd52'
      document.getElementById('authError').classList.remove('hidden')
    }
  })
  //end of supabase
  //surprise button
  document.getElementById('surpriseBtn').addEventListener('click', async () => {
    const surpriseBtn = document.getElementById('surpriseBtn')
    surpriseBtn.textContent = 'Finding somewhere new...'
    surpriseBtn.disabled = true

    clearMarkers()

    const excludedList = shownPlaceNames.join(', ')

    const recRes = await fetch('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        places: lastPlaces,
        situation: lastSituation,
        exclude: excludedList
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
  //end of surprise button
})

function initMap(lat, lng) {
  map = new maplibregl.Map({
    container: 'map',
    style: 'https://tiles.openfreemap.org/styles/dark',
    center: [lng, lat],
    zoom: 14
  })

  map.on('load', () => {
    new maplibregl.Marker({
      color: '#ffffff'
    })
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

  findBtn.addEventListener('click', async () => {
    const situation = getSituation()

    findBtn.disabled = true
    findBtn.textContent = 'Finding...'
    results.classList.add('hidden')
    skeleton.classList.remove('hidden')

    clearMarkers()

    try {
      const placesRes = await fetch('/api/places', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
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
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          places: placesData.places,
          situation
        })
      })
      const recData = await recRes.json()

      skeleton.classList.add('hidden')

      if (!recData.recommendations?.length) {
        showError('Could not find a match. Try different options.')
        return
      }

      displayResults(recData.recommendations, placesData.places)


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
    const distanceText = rec.distance ?
      rec.distance < 1000 ?
        `${rec.distance}m away` :
        `${(rec.distance / 1000).toFixed(1)}km away` :
      ''

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
        map.flyTo({
          center: [rec.longitude, rec.latitude],
          zoom: 16
        })
      }
    })

    results.appendChild(card)

    if (rec.latitude && rec.longitude) {
      const marker = new maplibregl.Marker({
        color: '#19bd52'
      })
        .setLngLat([rec.longitude, rec.latitude])
        .addTo(map)
      markers.push(marker)
    }
  })

  results.classList.remove('hidden')
}

displayResults(recData.recommendations, placesData.places)
recData.recommendations.forEach(r => shownPlaceNames.push(r.name))
document.getElementById('surpriseBtn').classList.remove('hidden')

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

  const {
    error
  } = await supabase.from('saved_places').insert({
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