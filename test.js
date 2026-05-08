
Skunkworks RAG
Ask ingested lecture transcripts; browse matching clips.

API online
Lecture RAG
Ask the transcripts
Create a comprehensive list of questions for a study guide from all the transcripts in this group.
Question
Search scope
All ingested lectures
This lecture only
133 lecture(s) in the database. Global search ranks the best clips across all of them.

Lecture group
p:advanced quantum mechanics

Course / topic bucket (grouped from titles).

Part
all

One lecture or all parts that share this group.

Titles group by shared topic after “|”, or by course name for patterns like “Course | lecture N”.

Answer
Claude + transcript
Scope: All parts · Advanced Quantum Mechanics (10 videos)
# Comprehensive Study Guide: Quantum Mechanics & Quantum Field Theory
## Stanford Physics Lecture Series

---

## OVERVIEW/SUMMARY

These lectures cover the bridge between **quantum mechanics** and **quantum field theory (QFT)**, spanning several interconnected topics:

- **Harmonic oscillator algebra** (creation/annihilation operators) as the mathematical backbone of QFT
- **Angular momentum** in quantum mechanics: operators, commutation relations, multiplets, and central force problems
- **Wave functions, operators, and the Schrödinger equation** (time-dependent and time-independent)
- **Symmetry** in quantum mechanics: rotational symmetry, symmetry groups, degeneracy
- **Identical particles**: Bosons vs. Fermions, Bose/Fermi statistics, second quantization
- **Quantum field theory basics**: field operators, creation/annihilation operators, Hamiltonians, particle decay/scattering
- **Relativistic quantum mechanics**: Dirac equation, Klein-Gordon equation, the Dirac sea, antimatter (positrons)
- **Atomic structure**: electron shells, Pauli exclusion principle, the periodic table
- **Zero-point energy** and its physical (ir)relevance
- **Fourier transforms** connecting position-space and momentum-space representations

---

## KEY FORMULAS AND CONCEPTS

### Harmonic Oscillator
```
H = p²/2m + ½mω²x²        (Standard Hamiltonian, m=1 often set)
H = ħω(a⁺a + ½)           (In terms of ladder operators)
[a⁻, a⁺] = 1              (Fundamental commutation relation)
[a⁺, a⁺] = 0,  [a⁻, a⁻] = 0
E_n = ħω(n + ½)            (Energy eigenvalues)
```

**Number Operator:**
```
N = a⁺a
N|n⟩ = n|n⟩
```

### Angular Momentum
```
[Lx, Ly] = iħLz
[Ly, Lz] = iħLx
[Lz, Lx] = iħLy
L² = Lx² + Ly² + Lz²
L²|l,m⟩ = ħ²l(l+1)|l,m⟩
Lz|l,m⟩ = mħ|l,m⟩
```
- **m** ranges from **-l to +l** (integer or half-integer steps)
- **l** = 0, 1/2, 1, 3/2, 2, ...

### Schrödinger Equation
```
Time-dependent:   iħ ∂|ψ⟩/∂t = H|ψ⟩
Time-independent: H|ψ⟩ = E|ψ⟩
Time evolution:   |ψ(t)⟩ = e^(-iHt/ħ)|ψ(0)⟩
Eigenstates:      |ψ(t)⟩ = e^(-iEt/ħ)|ψ⟩
```

### Radial Schrödinger Equation (Central Force)
```
H = PR²/2m + L²/2mr² + V(r)
PR = -iħ d/dr
```

### Position and Momentum Operators
```
X̂|x⟩ = x|x⟩                   (Position operator)
p̂ = -iħ d/dx                   (Momentum operator)
[x̂, p̂] = iħ                    (Canonical commutation)
```

### Fourier Transform (QM)
```
ψ(p) = ∫ e^(-ipx/ħ) ψ(x) dx    (Position → Momentum)
ψ(x) = ∫ e^(ipx/ħ) ψ(p) dp    (Momentum → Position)
```

### Second Quantization / QFT
```
ψ(x) = Σᵢ aᵢ uᵢ(x)             (Field operator, bosons)
ψ(x) = ∫ dp ã(p) e^(ipx/ħ)    (Fourier expansion)
[aᵢ, aⱼ⁺] = δᵢⱼ               (Boson commutators)
{aᵢ, aⱼ⁺} = δᵢⱼ               (Fermion anti-commutators)
```

### Bose vs. Fermi Statistics
```
Bosons:   |x₁, x₂⟩ = +|x₂, x₁⟩   (symmetric)
Fermions: |x₁, x₂⟩ = -|x₂, x₁⟩   (antisymmetric)
```

### Zero-Point Energy
```
E_0 = ½ħω   (per oscillator mode)
```
Adding a constant to H commutes with everything → no effect on equations of motion.

---

## 50 TOP QUESTIONS

---

## THEORY QUESTIONS (Conceptual Understanding)

---

### Q1. Why is the harmonic oscillator so central to quantum field theory?

**Answer:** The harmonic oscillator is the fundamental mathematical structure underlying QFT. Any system near equilibrium oscillates harmonically. Quantum fields decompose into modes, each behaving like an independent harmonic oscillator. The algebra of creation (a⁺) and annihilation (a⁻) operators encodes particle creation and destruction.

**Explanation:** As Susskind states: *"The harmonic oscillator is the central ingredient, the central mathematical structure that goes into Quantum Field Theory."* The radiation field in a cavity, for example, decomposes into modes with definite frequencies — each a harmonic oscillator. Even the vacuum is defined as the ground state of all these oscillators.

---

### Q2. What is a "creation operator" and what does it physically represent in QFT?

**Answer:** A creation operator a⁺ (or a†) adds one quantum of excitation (one particle) to a state. In QFT, applying a⁺ at position x creates a particle at that position.

**Explanation:** The field operator ψ(x) can be thought of as a superposition of creation and annihilation operators at definite positions. When ψ†(x) acts on the vacuum |0⟩, it creates a particle at x. This is the fundamental building block of how particles are represented in QFT.

```
Diagram: Action of Ladder Operators

|n+1⟩ ←——— a⁺ ———— |n⟩ ←——— a⁺ ———— |n-1⟩
|n+1⟩ ———— a⁻ ————→ |n⟩ ———— a⁻ ————→ |n-1⟩

Ground state: a⁻|0⟩ = 0 (cannot go lower)
```

---

### Q3. What is the physical meaning of zero-point energy, and why is it generally considered irrelevant?

**Answer:** Zero-point energy (E₀ = ½ħω) is the energy of the ground state of the harmonic oscillator — it exists even when no quanta are present. It's irrelevant because adding a constant to the Hamiltonian doesn't affect equations of motion.

**Explanation:** Since the Hamiltonian generates time evolution through commutators [A, H], and constants commute with everything, adding ½ħω to H changes nothing observable. However, in QFT with infinitely many modes, the total zero-point energy diverges — this is a famous conceptual problem (vacuum energy / cosmological constant problem).

---

### Q4. What is the difference between Bosons and Fermions in terms of state symmetry?

**Answer:**
- **Bosons**: Multi-particle state is *symmetric* under particle interchange: |x₁,x₂⟩ = +|x₂,x₁⟩
- **Fermions**: Multi-particle state is *antisymmetric* under particle interchange: |x₁,x₂⟩ = -|x₂,x₁⟩

**Explanation:** This difference has profound consequences. For fermions, if two particles are in the same state, the antisymmetry forces the state to be zero — this is the **Pauli Exclusion Principle**. Bosons have no such restriction and can pile into the same state (Bose-Einstein condensation).

---

### Q5. What is the Pauli Exclusion Principle, and how does it arise mathematically?

**Answer:** No two identical fermions can occupy the same quantum state simultaneously. Mathematically, if x₁ = x₂ for fermions, then |x₁,x₂⟩ = -|x₂,x₁⟩ = -|x₁,x₂⟩, which implies |x₁,x₂⟩ = 0.

**Explanation:** This is why electrons fill atomic shells — each electron must have a unique set of quantum numbers (n, l, m, spin). It explains the structure of the periodic table, the stability of matter, and why atoms don't collapse.

---

### Q6. What does it mean physically that "anything you do to determine the path of a particle ruins the experiment" in the double-slit context?

**Answer:** In quantum mechanics, the act of measurement collapses the wave function. If you detect which slit an electron passes through, you destroy the interference pattern because you've gained which-path information, collapsing the superposition.

**Explanation:** The electron exists in a superposition of passing through both slits simultaneously. The interference pattern emerges from this superposition. Any interaction strong enough to determine which path carries enough momentum transfer to wash out the interference fringes (complementarity principle).

---

### Q7. What is a symmetry in quantum mechanics, and what are two key examples?

**Answer:** A symmetry is a transformation that preserves the physical content of a system — specifically, it preserves inner products between state vectors (and hence probabilities).

**Explanation:** Two key examples are:
1. **Rotational symmetry**: If a system's Hamiltonian is invariant under rotation, then angular momentum is conserved. All states in a multiplet (same l, different m) are degenerate.
2. **Time evolution**: The unitary operator e^(-iHt/ħ) preserves inner products between states.

---

### Q8. What is a symmetry group, and why do physicists care about degeneracy?

**Answer:** A symmetry group is the collection of all symmetry operations (transformations) that leave the Hamiltonian invariant. Degeneracy matters because:
1. It tells you which energy levels are equal
2. It constrains which transitions (photon emission/absorption) are allowed

**Explanation:** If states are degenerate due to symmetry, you know they're connected by the symmetry operation. Whether a photon can be emitted between two states depends on selection rules derived from symmetry — so knowing degeneracy structure tells you about spectral lines.

---

### Q9. What is the relationship between eigenvalues of the Hamiltonian and energy levels?

**Answer:** The eigenvalues of the Hamiltonian operator H are precisely the allowed energy levels E_n of the quantum system. The time-independent Schrödinger equation H|ψ⟩ = E|ψ⟩ is an eigenvalue equation whose solutions give these levels.

**Explanation:** Solving H|ψ⟩ = E|ψ⟩ for a given potential V(x) yields:
- Discrete energy levels (bound states) for confining potentials
- Continuous energy spectrum for scattering states

---

### Q10. What are bound states, and when do they occur?

**Answer:** A bound state is a quantum state whose wave function is spatially localized (doesn't spread to infinity). They correspond to discrete energy eigenvalues and occur when the particle's energy is less than the potential at infinity.

**Explanation:** For a central potential like the Coulomb potential (hydrogen atom), there are multiple bound states for each value of angular momentum quantum number l. These give rise to the discrete spectral lines of hydrogen.

---

### Q11. How does time evolution of an energy eigenstate work?

**Answer:** An energy eigenstate |E⟩ evolves in time simply by acquiring a phase factor:
|ψ(t)⟩ = e^(-iEt/ħ)|ψ(0)⟩

**Explanation:** This means the *physical state* (probabilities) doesn't change for an eigenstate — it's a stationary state. For superpositions of energy eigenstates, the different phase factors produce time-varying interference, giving rise to oscillations and dynamics.

---

### Q12. What is the connection between angular momentum and central force problems?

**Answer:** For a particle in a central force field (V depends only on r), angular momentum is conserved because the potential is rotationally symmetric. The Hamiltonian commutes with all components of L, making angular momentum a good quantum number.

**Explanation:**
```
Central Force Diagram:

         *  ← particle orbit
        / \
       /   \
      *—————* ← center of force
       \   /
        \ /
         *

The orbit stays in a plane. In QM, instead of 
a definite orbit, we have a wave function with 
definite l and m quantum numbers.
```

---

### Q13. Why do integer and half-integer angular momenta both arise from the algebra?

**Answer:** The commutation relations [Lx,Ly] = iħLz alone (without physical constraints) allow both integer (l = 0,1,2,...) and half-integer (l = 1/2, 3/2,...) eigenvalue spectra. Physical systems can realize both.

**Explanation:** The mathematical analysis shows that m ranges from -l to +l in integer steps, and l can be any non-negative integer or half-integer. Orbital angular momentum of particles in 3D space requires integer l (because wave functions must be single-valued). Spin is intrinsically half-integer for electrons.

---

### Q14. What distinguishes orbital angular momentum from spin angular momentum?

**Answer:** Orbital angular momentum (L) arises from the physical motion of a particle around a center. Spin (S) is an intrinsic angular momentum with no classical analog. Orbital angular momentum requires integer quantum numbers; spin can be half-integer.

**Explanation:** For wave functions ψ(r,θ,φ), single-valuedness under 2π rotation (φ → φ + 2π) requires integer m values. But spinors under 2π rotation pick up a factor of -1 (they need 4π rotation to return to themselves), allowing half-integer spin. Electrons have spin-1/2.

---

### Q15. What is second quantization, and why is it used?

**Answer:** Second quantization is a formalism where the wave function itself is treated as a quantum field — an operator acting on a Fock space of states with varying particle numbers. It naturally handles systems with variable numbers of identical particles.

**Explanation:** In first quantization, you fix N particles and symmetrize/antisymmetrize. In second quantization:
- Vacuum state |0⟩ has no particles
- Creation operators build up states with any number of particles
- Automatically implements Bose or Fermi statistics through commutator/anticommutator algebra

---

### Q16. What is a quantum field, and how is it related to creation/annihilation operators?

**Answer:** A quantum field ψ(x) is an operator-valued function of position. It can be expanded in terms of creation and annihilation operators:
ψ(x) = Σᵢ aᵢ uᵢ(x)
where uᵢ(x) are mode functions and aᵢ are annihilation operators.

**Explanation:** The field ψ(x) annihilates a particle at position x, while ψ†(x) creates one. This is the quantum field theory upgrade from single-particle QM: instead of a wave function, the fundamental object is an operator field.

---

### Q17. What is the Dirac sea, and what problem does it solve?

**Answer:** The Dirac sea is Dirac's original interpretation of negative-energy solutions in his relativistic electron equation. He proposed that all negative-energy states are filled with electrons (an infinite "sea"), preventing real electrons from falling into them.

**Explanation:** The Dirac equation for a relativistic electron has both positive and negative energy solutions. To prevent catastrophic energy emission, Dirac proposed the vacuum is the state with all negative-energy levels occupied. Modern QFT replaces this with a more elegant approach: reinterpreting creation operators for negative-energy states as annihilation operators for positive-energy antiparticles (positrons).

---

### Q18. What is a positron, and how does it emerge from the Dirac equation?

**Answer:** A positron is the antiparticle of the electron — same mass, opposite charge. In modern QFT, what Dirac interpreted as a "hole" in the negative-energy sea is the absence of a negative-energy electron, which behaves exactly like a positive-energy particle with positive charge.

**Explanation:** The modern approach: replace creation operators for negative-energy states with annihilation operators for positive-energy antiparticles. This reveals a complete symmetry between electrons and positrons. The vacuum is symmetric — you could equally well think of it as "filled with positrons" as "filled with electrons."

---

### Q19. What is the Klein-Gordon equation, and how does it differ from the Dirac equation?

**Answer:** The Klein-Gordon equation is a relativistic wave equation for spin-0 particles (bosons):
(∂² + m²c²/ħ²)ψ = 0
The Dirac equation is linear in momentum (first-order) and describes spin-1/2 particles (fermions). H = linear function of p for Dirac, but not for Klein-Gordon.

**Explanation:** The Klein-Gordon equation doesn't have the form H = (linear in p), unlike the Dirac equation. This makes it more complicated to interpret as a single-particle theory but is natural for scalar bosons. Klein-Gordon admits both positive and negative energy solutions, leading to the particle-antiparticle interpretation.

---

### Q20. What is the physical significance of the commutation relations [aᵢ, aⱼ†] = δᵢⱼ?

**Answer:** This commutation relation is the algebraic statement of Bose statistics. It says that creating a particle of type j and then destroying one of type i gives a result that differs from the reverse order by the identity (when i=j) or zero (when i≠j).

**Explanation:** For fermions, the analogous anticommutation relation {aᵢ, aⱼ†} = δᵢⱼ encodes Fermi statistics. The choice of commutator vs. anticommutator determines the entire statistical behavior of the particles — whether they're bosons or fermions.

---

### Q21. Why can't you determine which slit an electron passes through without destroying the interference pattern?

**Answer:** By the uncertainty principle, determining position (which slit) requires a momentum transfer large enough to randomize the phase, destroying coherence and hence interference.

**Explanation:** To know which slit, you must interact with the electron with photons or some probe. That interaction transfers momentum of order ħ/d (where d is the slit separation), which is sufficient to smear out the interference fringes. This is complementarity: wave behavior and particle behavior are mutually exclusive aspects.

---

### Q22. How does the Fourier transform connect position-space and momentum-space wave functions?

**Answer:** The momentum-space wave function ψ(p) is the Fourier transform of the position-space wave function ψ(x):
ψ(p) = ∫ e^(-ipx/ħ) ψ(x) dx

**Explanation:** In QFT, this is how field operators are decomposed: a field operator in position space is a Fourier transform of creation/annihilation operators in momentum space. The momentum-space operators a(p), a†(p) create/destroy particles of definite momentum.

---

### Q23. What is a multiplet in the context of angular momentum, and how many states does it contain?

**Answer:** A multiplet is a set of states with the same angular momentum quantum number l but different m values (m = -l, -l+1, ..., l-1, l). It contains 2l+1 states.

**Explanation:**
```
l=0: 1 state  (m=0)                    → singlet
l=1: 3 states (m=-1,0,+1)             → triplet
l=2: 5 states (m=-2,-1,0,+1,+2)       → quintet
l=1/2: 2 states (m=-1/2, +1/2)        → doublet (spin-1/2)
```
All states in a multiplet are degenerate in energy when H commutes with L² (rotational symmetry).

---

### Q24. What is the "number operator" and what are its eigenstates?

**Answer:** The number operator N = a⁺a counts the number of quanta (particles) in a state. Its eigenstates are the Fock states |n⟩, with eigenvalue n (a non-negative integer).

**Explanation:** In QFT, for each mode, there's a number operator. The total particle number is the sum over all modes. For a simple harmonic oscillator, n gives the excitation level and the energy is E_n = ħω(n + ½).

---

### Q25. How does the harmonic oscillator relate to angular momentum algebra?

**Answer:** The ladder operator structure of the harmonic oscillator (a⁺ raises, a⁻ lowers) is mathematically analogous to the raising/lowering operators (L₊, L₋) for angular momentum. Both involve raising and lowering discrete quantum numbers with a minimum/maximum cutoff.

**Explanation:** The analogy is: a⁺ ↔ L₊ and a⁻ ↔ L₋. For angular momentum, there are both upper (m = l) and lower (m = -l) bounds. For the harmonic oscillator, there's only a lower bound (n = 0). This algebraic similarity means techniques developed for one transfer to the other.

---

## PRACTICAL QUESTIONS (Problem-Solving & Calculations)

---

### Q26. Given H = ħω(a⁺a + ½), what are the energy levels? What is the ground state energy?

**Answer:**
E_n = ħω(n + ½), for n = 0, 1, 2, 3, ...
Ground state (n=0): E₀ = ½ħω (zero-point energy)

**Solution:**
```
H|n⟩ = ħω(a⁺a + ½)|n⟩
      = ħω(N + ½)|n⟩
      = ħω(n + ½)|n⟩

Level diagram:
E₄ = 9ħω/2  ————
E₃ = 7ħω/2  ————    Each step = ħω
E₂ = 5ħω/2  ————
E₁ = 3ħω/2  ————
E₀ = ħω/2   ————  ← ground state (zero-point energy)
```

---

### Q27. If a⁻|n⟩ = √n|n-1⟩ and a⁺|n⟩ = √(n+1)|n+1⟩, what is a⁻|0⟩? What is a⁺|0⟩?

**Answer:**
- a⁻|0⟩ = 0 (annihilating the vacuum gives zero — not |−1⟩, which doesn't exist)
- a⁺|0⟩ = √1|1⟩ = |1⟩

**Explanation:** The vacuum is the lowest state; you cannot lower below it. The creation operator generates the first excited state from the vacuum.

---

### Q28. Verify that [a⁻, a⁺] = 1 using the definition N = a⁺a.

**Answer:**
```
a⁻a⁺ = N + 1    (since a⁻a⁺|n⟩ = a⁻√(n+1)|n+1⟩ = √(n+1)·√(n+1)|n⟩ = (n+1)|n⟩)
a⁺a⁻ = N        (by definition)

[a⁻, a⁺] = a⁻a⁺ - a⁺a⁻ = (N+1) - N = 1  ✓
```

---

### Q29. For a spin-1 particle (l=1), list all possible (l, m) states and write out the action of Lz on each.

**Answer:**
The three states are |1,1⟩, |1,0⟩, |1,-1⟩

```
Lz|1,1⟩  = +ħ|1,1⟩
Lz|1,0⟩  =  0|1,0⟩
Lz|1,-1⟩ = -ħ|1,-1⟩
```

**Explanation:**
```
m = +1  ●   ↑
m =  0  ●   → (zero z-component)
m = -1  ●   ↓
```
These three states form a triplet multiplet; all have the same energy in a rotationally symmetric potential.

---

### Q30. A particle is in energy eigenstate |E⟩ at t=0. Write its state at time t.

**Answer:**
|ψ(t)⟩ = e^(-iEt/ħ)|E⟩

**Explanation:** This follows directly from the time-dependent Schrödinger equation iħ∂|ψ⟩/∂t = H|ψ⟩. For an eigenstate, H|E⟩ = E|E⟩, so the differential equation is solved by multiplying by the phase factor. Physical probabilities |⟨φ|ψ(t)⟩|² are time-independent for energy eigenstates.

---

### Q31. What is the wave function in momentum space if ψ(x) = δ(x - x₀)?

**Answer:**
ψ(p) = ∫ e^(-ipx/ħ) δ(x - x₀) dx = e^(-ipx₀/ħ)

**Explanation:** The position eigenstate (delta function in x) has equal probability amplitude for all momenta — consistent with the uncertainty principle: perfectly localized position means completely uncertain momentum. The Fourier transform of a delta function is a plane wave.

---

### Q32. What is the wave function in position space if ψ(p) = δ(p - p₀)?

**Answer:**
ψ(x) = ∫ e^(ipx/ħ) δ(p - p₀) dp = e^(ip₀x/ħ)

**Explanation:** A definite momentum state (delta function in p) corresponds to a plane wave in position space — uniform probability across all positions. Again, the uncertainty principle: definite momentum means completely uncertain position.

---

### Q33. In the central force problem, write the radial Schrödinger equation.

**Answer:**
The Hamiltonian splits as H = PR²/2m + L²/2mr² + V(r)

With PR = -iħ d/dr, the radial equation becomes:
```
-ħ²/2m · d²u/dr² + [V(r) + ħ²l(l+1)/2mr²]u(r) = E·u(r)
```
where u(r) = r·R(r) is the reduced radial wave function.

**Explanation:** The term ħ²l(l+1)/2mr² acts as a centrifugal barrier — an effective potential that pushes the particle away from the origin for l > 0.

---

### Q34. For the hydrogen atom, how many states exist with principal quantum number n=2?

**Answer:** 4 states total:
- l=0, m=0: one state (2s orbital)
- l=1, m=-1,0,+1: three states (2p orbitals)

**Explanation:**
```
n=2 level:
┌─────────────────────────┐
│  l=0   │  l=1           │
│  m=0   │  m=-1, 0, +1   │
│  (2s)  │  (2p)          │
└─────────────────────────┘
Total: 1 + 3 = 4 states
(8 states including spin: ×2 for spin-up/down)
```
The degeneracy of the n=2 level (different l having same energy) is a special feature of the Coulomb potential.

---

### Q35. If you add a constant C to the Hamiltonian H → H + C, how do the equations of motion change?

**Answer:** They don't change. A constant C commutes with every operator: [A, H+C] = [A, H] + [A, C] = [A, H] + 0 = [A, H].

**Explanation:** Since equations of motion have the form dA/dt = (i/ħ)[H, A], adding a constant C leaves [H+C, A] = [H, A]. Energy differences are what matter physically, not absolute energy. This is why zero-point energy is irrelevant for dynamics.

---

### Q36. Write the commutator [aᵢ⁻, aⱼ⁺] for a multi-mode bosonic field. What does it equal?

**Answer:**
[aᵢ⁻, aⱼ⁺] = δᵢⱼ

Where δᵢⱼ is the Kronecker delta (1 if i=j, 0 if i≠j).

**Explanation:**
```
[aᵢ⁻, aⱼ⁺] = δᵢⱼ
[aᵢ⁻, aⱼ⁻] = 0
[aᵢ⁺, aⱼ⁺] = 0
```
These are the fundamental commutation relations for a collection of independent bosonic oscillators — the algebra of a quantum field.

---

### Q37. For fermions, what is the anticommutation relation, and what does it imply?

**Answer:**
{aᵢ, aⱼ†} = δᵢⱼ
{aᵢ, aⱼ} = 0
{aᵢ†, aⱼ†} = 0

**Implication:** (aᵢ†)² = 0 — you cannot create two fermions in the same mode.

**Explanation:**
```
(aᵢ†)² = ½{aᵢ†, aᵢ†} = ½·0 = 0

This is the Pauli Exclusion Principle in algebraic form!
Trying to put two fermions in the same state gives zero.
```

---

### Q38. What is the energy spectrum of a harmonic oscillator with ω = 1 rad/s and ħ = 1 (natural units)? List the first four levels.

**Answer:**
```
E_n = (n + ½)ħω = (n + ½)

n=0: E₀ = 0.5
n=1: E₁ = 1.5
n=2: E₂ = 2.5
n=3: E₃ = 3.5

Energy level diagram:
─────────  E₃ = 3.5
─────────  E₂ = 2.5
─────────  E₁ = 1.5
─────────  E₀ = 0.5  ← zero-point energy
```

---

### Q39. How is the Hamiltonian of a quantum field built from creation and annihilation operators?

**Answer:**
For a free bosonic field:
H = Σₖ ħωₖ (aₖ†aₖ + ½) = Σₖ ħωₖ (Nₖ + ½)

**Explanation:** Each mode k contributes an independent harmonic oscillator. The total energy is the sum over all modes of (number of particles in that mode × energy per particle) plus zero-point contributions. In QFT, the kinetic energy comes from this structure; interactions add additional terms.

---

### Q40. In beta decay, n → p + e⁻ + ν̄, how would a QFT Hamiltonian term describe this?

**Answer:** The interaction term would be proportional to:
H_int ∝ a†_p · a†_e · a†_ν̄ · a_n + h.c.

This creates a proton, electron, and antineutrino while destroying a neutron (plus the Hermitian conjugate for the reverse process).

**Explanation:** In QFT, every particle process is described by terms in the Hamiltonian that are products of field operators. Each field operator either creates or annihilates particles of its type. The coupling constants (strengths) came initially from experiment; later, gauge theory principles constrain them.

---

### Q41. Verify that for a spin-1/2 particle, there are only 2 states in the multiplet.

**Answer:**
For l = 1/2: m ranges from -1/2 to +1/2 in steps of 1.
Number of states = 2l + 1 = 2(1/2) + 1 = 2 states: |1/2, +1/2⟩ and |1/2, -1/2⟩

**Explanation:**
```
m = +1/2  ●  "spin up"   ↑
m = -1/2  ●  "spin down" ↓
```
These two states are degenerate in the absence of a magnetic field. In a magnetic field, they split (Zeeman effect) by ΔE = 2μ_B B.

---

### Q42. If the wave function of a system is ψ(x,t) = e^(-iE₁t/ħ)ψ₁(x) + e^(-iE₂t/ħ)ψ₂(x), what is the probability density?

**Answer:**
|ψ|² = |ψ₁|² + |ψ₂|² + 2Re[ψ₁*ψ₂ e^(-i(E₂-E₁)t/ħ)]

**Explanation:** The cross term oscillates at frequency (E₂-E₁)/ħ — this is a quantum beat, producing time-varying probability density. This is the origin of spectral lines: photons emitted at frequency ν = (E₂-E₁)/h when a system oscillates between levels.

---

### Q43. For a particle in a central force field, what quantum numbers label each state?

**Answer:** Three quantum numbers: **(n, l, m)**
- n: principal quantum number (related to radial excitation)
- l: orbital angular momentum quantum number (l = 0, 1, 2, ...)
- m: magnetic quantum number (-l ≤ m ≤ l)

**Explanation:**
```
n=1: l=0 only               → 1 state (×2 with spin = 2)
n=2: l=0,1                  → 4 states (×2 = 8)
n=3: l=0,1,2                → 9 states (×2 = 18)

General: Σ(l=0 to n-1) (2l+1) = n² states per n
```

---

### Q44. What does it mean for the Hamiltonian to commute with L²? What physical consequence follows?

**Answer:** [H, L²] = 0 means angular momentum magnitude is a conserved quantity. As a consequence, energy eigenstates can simultaneously be eigenstates of L², and states with the same l (but different n or m) within degenerate subspaces can be found.

**Explanation:** When [H, L²] = 0, you can find simultaneous eigenstates of H and L². The eigenvalue l(l+1)ħ² of L² doesn't change in time. This is a selection rule: angular momentum is conserved in any process governed by this Hamiltonian.

---

### Q45. In neon (atomic number 10), why are there 8 electrons in the "first excited energy level"?

**Answer:** The first excited shell (n=2) has l=0 (2 states with spin) and l=1 (6 states: 3 orbital states × 2 spin states), giving 8 states total. Pauli exclusion fills each with exactly one electron.

**Explanation:**
```
n=2 shell:
l=0: m=0, spin=±1/2     → 2 electrons
l=1: m=-1,0,1, spin=±1/2 → 6 electrons
Total: 8 electrons → complete shell = neon
```
The special stability of neon (noble gas) comes from this complete shell — no unfilled states at low energy.

---

### Q46. How does the field operator ψ(x) in position space relate to momentum-space operators ã(p)?

**Answer:** Through Fourier transform:
ψ(x) = ∫ ã(p) e^(ipx/ħ) dp/√(2πħ)
ψ†(x) = ∫ ã†(p) e^(-ipx/ħ) dp/√(2πħ)

**Explanation:** The annihilation operator ψ(x) at a definite position is a superposition of annihilation operators ã(p) at all momenta. This is exactly the same Fourier relationship as between position-space and momentum-space wave functions in ordinary QM — but now the wave function itself has become an operator.

---

### Q47. What is the "rotational state" problem for a small molecule, and why might it effectively appear as a sphere?

**Answer:** If the energy gap ΔE between the rotational ground state and first excited rotational state is much larger than the energy of probing photons, the molecule's orientation cannot be resolved — it appears rotationally symmetric (sphere-like).

**Explanation:** The rotational energy gap scales as ħ²/2I (I = moment of inertia). For very small objects (small I), this gap is huge. If your apparatus has photons with energy less than ħ²l(l+1)/2I for l=1, you cannot excite rotational states and cannot resolve orientation. The object appears spherically symmetric to that apparatus.

---

### Q48. Write down the two-particle wave function for two identical bosons in states φ₁ and φ₂.

**Answer:**
ψ(x₁,x₂) = (1/√2)[φ₁(x₁)φ₂(x₂) + φ₂(x₁)φ₁(x₂)]

**Explanation:** This is the symmetrized combination. Swapping x₁ ↔ x₂ leaves ψ unchanged (bosonic symmetry). For fermions:
ψ(x₁,x₂) = (1/√2)[φ₁(x₁)φ₂(x₂) - φ₂(x₁)φ₁(x₂)]
Setting φ₁ = φ₂ gives zero for fermions → Pauli exclusion.

---

### Q49. For a free non-relativistic particle, what is the energy-momentum relationship, and how does the QFT Hamiltonian reflect this?

**Answer:**
E = p²/2m (non-relativistic)

In QFT, the kinetic energy term in the Hamiltonian is:
H_kin = ∫ dp · (p²/2m) · ã†(p)ã(p)

**Explanation:** Each momentum mode p has energy p²/2m, weighted by the number of particles ã†(p)ã(p) in that mode. Summing over all modes gives the total kinetic energy. This is the momentum-space representation of the kinetic energy operator.

---

### Q50. In the modern QFT treatment replacing the Dirac sea, what substitution is made for negative-energy states, and what symmetry does this reveal?

**Answer:**
Replace: c†(negative energy, -p) → b(-p) (annihilation operator for positron)

This substitution reveals a complete electron-positron symmetry: the theory is symmetric under interchanging the roles of electrons and positrons. The vacuum could equally well be described as "filled with positrons" as "filled with electrons."

**Explanation:**
```
Dirac Sea picture:         Modern QFT picture:
Vacuum = all negative      Vacuum = |0⟩
  energy levels filled     
Positron = hole in sea     Positron = distinct antiparticle

Substitution:
c†_{-energy}(-p) → b(-p)  ← annihilation of positron

Result: H = Σ_p E_p(a†_p a_p + b†_p b_p) + const
         (electrons)        (positrons)
Complete symmetry! ✓
```

---

## STUDY TIPS

### 1. **Master the Harmonic Oscillator First**
Everything in QFT builds on it. Make sure you can:
- Derive [a⁻, a⁺] = 1
- Find energy eigenvalues
- Act with a⁺ and a⁻ on any |n⟩
- Understand why zero-point energy is physically irrelevant

### 2. **Learn the Angular Momentum Algebra Thoroughly**
The commutation relations [Lᵢ, Lⱼ] = iħεᵢⱼₖLₖ are the foundation. From them alone you can derive all multiplet structure without solving differential equations.

### 3. **Connect the Two Algebras**
Notice the deep similarity: harmonic oscillator (a⁺, a⁻) and angular momentum (L₊, L₋) both involve raising/lowering operators with bounded spectra. Practice translating between them.

### 4. **Think in Terms of States and Operators**
Get comfortable with Dirac notation. Every physical quantity is an operator; every physical state is a vector. Measurement = eigenvalue; probability = |inner product|².

### 5. **Statistics Are Algebraic**
Don't memorize Bose/Fermi statistics as separate rules — derive them from commutators vs. anticommutators. This gives you the Pauli exclusion principle, occupation number restrictions, etc.

### 6. **Build QFT from QM Step by Step**
The logical chain is:
```
Single particle QM
    ↓
Multi-particle QM (symmetrized states)
    ↓
Second quantization (creation/annihilation operators)
    ↓
Quantum Field Theory (fields = operator-valued functions)
    ↓
Relativistic QFT (Dirac equation, Klein-Gordon, antiparticles)
```

### 7. **Use Physical Examples as Anchors**
- Harmonic oscillator → electromagnetic field modes in a cavity
- Angular momentum → electron orbitals → periodic table
- Fermi statistics → Pauli exclusion → atomic shell structure
- Antiparticles → beta decay, pair production

### 8. **Work Through Calculations by Hand**
Especially: verify commutators, act with operators on states, compute energy eigenvalues. These build the muscle memory that makes abstract formalism concrete.

### 9. **Don't Get Lost in Zero-Point Energy**
It appears infinite in QFT and is a famous unsolved problem in physics. For exam purposes, understand why it drops out of equations of motion — that's what's tested.

### 10. **Cross-Reference Lecture Material**
These topics span multiple lectures. Angular momentum is developed across several videos (7O1NhGP07Xo, LKYs_xwWKY4, A7PZftS7uOA), harmonic oscillator across D36VXLx0hOc and ATxq2IEekk4, and QFT fundamentals across 7a1hon7NJ1M, l6vR825BR3c, and 7G4C7scQX3A.

---

*This study guide synthesizes material from Stanford Physics lectures across multiple videos covering quantum mechanics and quantum field theory fundamentals. The topics are deeply interconnected — mastering the harmonic oscillator and angular momentum algebra will unlock understanding of everything from atomic spectra to relativistic quantum fields.*
Your question
Create a comprehensive list of questions for a study guide from all the transcripts in this group.

Related moments (40)
1 / 40

Advanced Quantum Mechanics Lecture 7
1:26:56 · 39% match
and how they're physics physics and how they're represented by these represented by these represented by these fields in a very simple context in a fields in a very simple context in a fields in a very simple context in a very simple context we'll talk about very simple context we'll talk about very simple context we'll talk about how field operators Implement processes how field operators Implement processes how field operators Implement processes that take place when particles Decay that take place when particles Decay that take place when particles Decay when particles scatter and so when particles scatter and so when particles scatter and so forth for more please visit us at forth for more please visit us at forth for more please visit us at stanford.edu


Advanced Quantum Mechanics Lecture 5
1:27:06 · 38% match
the magnetic fields. How do you the magnetic fields. How do you determine determine determine which which which If you only have one electron, how do If you only have one electron, how do If you only have one electron, how do you determine You don't. You don't. That's always the point of quantum That's always the point of quantum That's always the point of quantum mechanics. Anything that you do to mechanics. Anything that you do to mechanics. Anything that you do to determine the path ruins the experiment. determine the path ruins the experiment. determine the path ruins the experiment. Uh what's your source of electron? Hm? Uh what's your source of electron? Hm? Uh what's your source of electron? Hm? What you do is you go over here What you do is you go over here What you do is you go over here and you look at the interference pattern and you look at the interference pattern and you look at the interference pattern that happens. that happens. that happens. What is your source of electron? What What is your source of electron? What What is your source of electron? What does it look like? does it look like? does it look like? A hot wire. Just a hot wire. So, A hot wire. Just a hot wire. So, A hot wire. Just a hot wire. So, electrons are everywhere. electrons are everywhere. electrons are everywhere. Yeah. Yeah, yeah. Yeah, but you can you Yeah. Yeah, yeah. Yeah, but you can you Yeah. Yeah, yeah. Yeah, but you can you know, with appropriate electric and


Advanced Quantum Mechanics Lecture 8
1:16:00 · 36% match
tell you a few things about it would tell you a few things about it that uh that I haven't mentioned so far that uh that I haven't mentioned so far that uh that I haven't mentioned so far in no particular order but uh some of in no particular order but uh some of in no particular order but uh some of the physical consequences of it the first first thing is somebody asked me first first thing is somebody asked me whether the field operators and so forth whether the field operators and so forth whether the field operators and so forth how they're connected with Foria how they're connected with Foria how they're connected with Foria transforms so I thought I would tell you transforms so I thought I would tell you transforms so I thought I would tell you to begin with exactly what the to begin with exactly what the to begin with exactly what the connection with foror transforms is um it's very um it's very simple if you remember in ordinary simple if you remember in ordinary simple if you remember in ordinary quantum mechanics you have wave quantum mechanics you have wave quantum mechanics you have wave functions and the squares of the wave functions and the squares of the wave functions and the squares of the wave functions are um probabilities to find functions are um probabilities to find functions are um probabilities to find particles at different particles at different particles at different places you can Foria transform the wave places you can Foria transform the wave


Advanced Quantum Mechanics Lecture 1
1:00:53 · 35% match
that's that's what you need to that's it that's that's what you need to know that's a summary of uh a quarters know that's a summary of uh a quarters know that's a summary of uh a quarters worth of quantum mechanics that we did worth of quantum mechanics that we did worth of quantum mechanics that we did any questions can you if if in the time questions can you if if in the time dependent dependent dependent equation equation equation independ independ independ equation if in the time dependent Shing equation if in the time dependent Shing equation if in the time dependent Shing equation you replace S with equation you replace S with equation you replace S with e s with e yeah can you can you do yeah e s with e yeah can you can you do yeah e s with e yeah can you can you do yeah then then you can drop the K then then you can drop the K then then you can drop the K things things things right then it becomes just an equ a right then it becomes just an equ a right then it becomes just an equ a differential equation because H * e will differential equation because H * e will differential equation because H * e will be just e * be just e * be just e * e no no we don't want to drop the the e no no we don't want to drop the the e no no we don't want to drop the the Cat symbol leave this leave the cat Cat symbol leave this leave the cat Cat symbol leave this leave the cat symbol symbol symbol there right leave the cat symbol there there right leave the cat symbol there


Advanced Quantum Mechanics Lecture 1
19:22 · 35% match
of X you just multiply s of X by X that's of X by X that's of X by X that's all uh the igen vectors of X are the all uh the igen vectors of X are the all uh the igen vectors of X are the wave functions which are highly peaked wave functions which are highly peaked wave functions which are highly peaked very very narrow direct Delta functions very very narrow direct Delta functions very very narrow direct Delta functions all right in the same way the momentum all right in the same way the momentum all right in the same way the momentum operator now I'm not going to explain operator now I'm not going to explain operator now I'm not going to explain this in detail for this you go back to this in detail for this you go back to this in detail for this you go back to the lecture notes to or or to the the lecture notes to or or to the the lecture notes to or or to the lectures lectures lectures themselves what lecture was it that we themselves what lecture was it that we themselves what lecture was it that we talked about the momentum anybody talked about the momentum anybody talked about the momentum anybody remember remember remember art uh several of them but I think art uh several of them but I think art uh several of them but I think around eight around eight May yeah yeah around eight around eight May yeah yeah around eight around eight May yeah yeah yeah eight eight eight was uh eight was yeah eight eight eight was uh eight was


Advanced Quantum Mechanics Lecture 3
58:07 · 31% match
a problem which effectively equation for a problem which effectively has a potential energy which looks like has a potential energy which looks like has a potential energy which looks like this and we want to know what kind of this and we want to know what kind of this and we want to know what kind of wave functions and what kind of energy wave functions and what kind of energy wave functions and what kind of energy levels will it levels will it levels will it be be be okay if you know anything about solving okay if you know anything about solving okay if you know anything about solving Schrodinger Schrodinger Schrodinger equations then equations then equations then you know that given L with given l in you know that given L with given l in you know that given L with given l in other words with given the potential you other words with given the potential you other words with given the potential you know that first of all typically there know that first of all typically there know that first of all typically there are more than one bound State a bound are more than one bound State a bound are more than one bound State a bound state is a state which is confined with state is a state which is confined with state is a state which is confined with a wave function which doesn't leak out a wave function which doesn't leak out a wave function which doesn't leak out too too too far they correspond to discrete energy far they correspond to discrete energy


Advanced Quantum Mechanics Lecture 1
1:04:44 · 31% match
mechanics but it uh comes up classical mechanics but it uh comes up classical mechanics but it uh comes up and really hits you over the head in and really hits you over the head in and really hits you over the head in quantum quantum quantum mechanics and we need to mechanics and we need to mechanics and we need to explore largely for the purposes of explore largely for the purposes of explore largely for the purposes of understanding rotational symmetry we understanding rotational symmetry we understanding rotational symmetry we need to understand the concept of a need to understand the concept of a need to understand the concept of a symmetry so I'm going to spend 15 symmetry so I'm going to spend 15 symmetry so I'm going to spend 15 minutes explaining exactly what a minutes explaining exactly what a minutes explaining exactly what a symmetry is keep in mind if you want to keep one is keep in mind if you want to keep one in mind there are two that you can keep in mind there are two that you can keep in mind there are two that you can keep in mind uh for uh just to have something in mind uh for uh just to have something in mind uh for uh just to have something in your head one of them is rotation in your head one of them is rotation in your head one of them is rotation symmetry where it just says that if you symmetry where it just says that if you symmetry where it just says that if you take a system which satisfies a certain take a system which satisfies a certain


Advanced Quantum Mechanics Lecture 6
1:02:32 · 30% match
mechanics and so we're beginning to mechanics and so we're beginning to build up from thinking about ordinary build up from thinking about ordinary build up from thinking about ordinary particles we're beginning to build up an particles we're beginning to build up an particles we're beginning to build up an idea of collections of idea of collections of idea of collections of particles as harmonic particles as harmonic particles as harmonic oscillators and soon enough we're going oscillators and soon enough we're going oscillators and soon enough we're going to see the connection with to see the connection with to see the connection with Fields okay uh if there are no more Fields okay uh if there are no more Fields okay uh if there are no more questions uh maybe we'll take a five questions uh maybe we'll take a five questions uh maybe we'll take a five minute break because minute break because minute break because uh I need to stop for a few minutes and uh organize your minutes and uh organize your thoughts and we'll field a few questions thoughts and we'll field a few questions thoughts and we'll field a few questions before we go on is what honi hamiltonian that is the on is what honi hamiltonian that is the hamiltonian that is the hamiltonian that is the hamiltonian that is the hamiltonian we're going to find other hamiltonian we're going to find other hamiltonian we're going to find other very elegant ways to write very elegant ways to write


Advanced Quantum Mechanics Lecture 6
1:10:35 · 30% match
doesn't play it doesn't do anything it's doesn't play it doesn't do anything it's just Zero Point Energy and um why just Zero Point Energy and um why just Zero Point Energy and um why doesn't Zero Point Energy why is it doesn't Zero Point Energy why is it doesn't Zero Point Energy why is it irrelevant for everything well if you irrelevant for everything well if you irrelevant for everything well if you think what does energy is think what does energy is think what does energy is hamiltonian what happens if you add a hamiltonian what happens if you add a hamiltonian what happens if you add a constant a number to a hamiltonian well constant a number to a hamiltonian well constant a number to a hamiltonian well a number commutes with everything and if a number commutes with everything and if a number commutes with everything and if you remember what the hamiltonian does you remember what the hamiltonian does you remember what the hamiltonian does for you is it provides a method of for you is it provides a method of for you is it provides a method of getting equations of motion the time getting equations of motion the time getting equations of motion the time dependence of something is related to dependence of something is related to dependence of something is related to the commutator of that thing with a the commutator of that thing with a the commutator of that thing with a hamiltonian constants do nothing they hamiltonian constants do nothing they


Advanced Quantum Mechanics Lecture 6
7:08 · 30% match
it came in just as telling us what the came in just as telling us what the came in just as telling us what the energy for each increase of the number energy for each increase of the number energy for each increase of the number operator was the operator was the operator was the frequency together with har determine frequency together with har determine frequency together with har determine each time we go up a each time we go up a each time we go up a level how much energy it cost to jump level how much energy it cost to jump level how much energy it cost to jump the oscillator up one level or how much the oscillator up one level or how much the oscillator up one level or how much energy we might get back in some other energy we might get back in some other energy we might get back in some other form form if the oscillator jumps form form if the oscillator jumps form form if the oscillator jumps down if it jumps up for some reason down if it jumps up for some reason down if it jumps up for some reason that's how much energy we have to pay H that's how much energy we have to pay H that's how much energy we have to pay H bar Omega if it jumps down that's how bar Omega if it jumps down that's how bar Omega if it jumps down that's how much energy we get and much energy we get and much energy we get and um as I said that's the single harmonic um as I said that's the single harmonic um as I said that's the single harmonic oscillator but now if we have many


Advanced Quantum Mechanics Lecture 1
1:02:19 · 30% match
answer how an igen Vector changes with changes with changes with time it just gets multiplied by e to the time it just gets multiplied by e to the time it just gets multiplied by e to the I * the energy time time I * the energy time time I * the energy time time okay so that uh we can go through that okay so that uh we can go through that okay so that uh we can go through that we don't we don't we don't need it's in the notes go back to it and need it's in the notes go back to it and need it's in the notes go back to it and uh and check it out all right now the uh and check it out all right now the uh and check it out all right now the time evolution is one example of time evolution is one example of time evolution is one example of Transformations that you can do on a Transformations that you can do on a Transformations that you can do on a system uh which preserve certain facts system uh which preserve certain facts system uh which preserve certain facts about the system in particular which about the system in particular which about the system in particular which preserve the inner products between uh preserve the inner products between uh preserve the inner products between uh vectors in other words Words which vectors in other words Words which vectors in other words Words which preserve The Logical relationships preserve The Logical relationships preserve The Logical relationships between vectors preserve the notion of between vectors preserve the notion of


Advanced Quantum Mechanics Lecture 3
0:13 · 30% match
University okay if we're ready let's go University okay if we're ready let's go then we talked last time about angular then we talked last time about angular then we talked last time about angular momentum operators and I started to show momentum operators and I started to show momentum operators and I started to show you how the algebra of the angular you how the algebra of the angular you how the algebra of the angular momentum operators Works how momentum operators Works how momentum operators Works how multiplets with different angular multiplets with different angular multiplets with different angular momentum have certain numbers of states momentum have certain numbers of states momentum have certain numbers of states and the and the and the states states states form they call form they call form they call multiplets I'll come back to them in a multiplets I'll come back to them in a multiplets I'll come back to them in a minute but let's just talk more minute but let's just talk more minute but let's just talk more generally about what angular momentum is generally about what angular momentum is generally about what angular momentum is about uh a good example is an object a about uh a good example is an object a about uh a good example is an object a particle moving in a central force field here's the center particle moves field here's the center particle moves around in a central force field uh it around in a central force field uh it


Advanced Quantum Mechanics Lecture 4
39:12 · 30% match
of it okay that's that's the basic that's the basic that's the basic um physics of the harmonic oscillator um physics of the harmonic oscillator um physics of the harmonic oscillator you can work out the second level third you can work out the second level third you can work out the second level third level uh by the time you get to the level uh by the time you get to the level uh by the time you get to the fourth level you won't want to see it fourth level you won't want to see it fourth level you won't want to see it anymore but uh but it's anymore but uh but it's anymore but uh but it's straightforward straightforward straightforward um good um good um good question yeah uh on your drawing of the question yeah uh on your drawing of the question yeah uh on your drawing of the second level yeah shouldn't shouldn't it second level yeah shouldn't shouldn't it second level yeah shouldn't shouldn't it go through zero at go through zero at go through zero at zero zero zero uh it going to be x s is um no I don't uh it going to be x s is um no I don't uh it going to be x s is um no I don't think so I don't think so I think uh I think so I don't think so I think uh I think so I don't think so I think uh I think there's a constant term also yeah think there's a constant term also yeah think there's a constant term also yeah yeah yeah it's not it's not just x yeah yeah it's not it's not just x yeah yeah it's not it's not just x squared times squared times


Advanced Quantum Mechanics Lecture 2
1:24:21 · 29% match
the book and there is and there it's in the book and there is and there is a video that covers it o somewhere is a video that covers it o somewhere is a video that covers it o somewhere back in history oh we didn't we never back in history oh we didn't we never back in history oh we didn't we never did the harmonic oscillator okay in that did the harmonic oscillator okay in that did the harmonic oscillator okay in that case we'll come back to the harmonic case we'll come back to the harmonic case we'll come back to the harmonic oscillator and instead of telling you oscillator and instead of telling you oscillator and instead of telling you how much this is like the harmonic how much this is like the harmonic how much this is like the harmonic oscillator I will tell you how much the oscillator I will tell you how much the oscillator I will tell you how much the harmonic oscillator is like angular harmonic oscillator is like angular harmonic oscillator is like angular momentum momentum momentum good we this is self-contained it doesn't we this is self-contained it doesn't require us to no I thought that was one require us to no I thought that was one require us to no I thought that was one of your main motivations for this for of your main motivations for this for of your main motivations for this for the second course because you said Gee the second course because you said Gee the second course because you said Gee we didn't get to cover the harmonic


Advanced Quantum Mechanics Lecture 6
1:55 · 28% match
aspect of the oscillator but a new aspect of the oscillator but a new aspect of the harmonic harmonic harmonic oscillator a couple of new aspects of oscillator a couple of new aspects of oscillator a couple of new aspects of the harmonic oscillator just so that we the harmonic oscillator just so that we the harmonic oscillator just so that we have it in front of us because the have it in front of us because the have it in front of us because the harmonic oscillator is the central harmonic oscillator is the central harmonic oscillator is the central ingredient the central mathematical ingredient the central mathematical ingredient the central mathematical structure that goes into Quantum field structure that goes into Quantum field structure that goes into Quantum field Theory so we need to understand it make Theory so we need to understand it make Theory so we need to understand it make sure we understand it well but we're not going to worry about well but we're not going to worry about Springs and uh and you know systems Springs and uh and you know systems Springs and uh and you know systems oscillating when I speak about the oscillating when I speak about the oscillating when I speak about the harmonic oscill oscillator I'm really harmonic oscill oscillator I'm really harmonic oscill oscillator I'm really speaking about the algebra of those speaking about the algebra of those speaking about the algebra of those little operators A+ and a little operators A+ and a


Advanced Quantum Mechanics Lecture 2
1:47:13 · 28% match
would run out of anything that would run out of anything that would correspond to basically infinite angular correspond to basically infinite angular correspond to basically infinite angular momentum States states of infinite momentum States states of infinite momentum States states of infinite angular infinite capacity for but angular infinite capacity for but angular infinite capacity for but typically real angular momentum states typically real angular momentum states typically real angular momentum states of atoms and so forth in of atoms and so forth in of atoms and so forth in somewhere somewhere somewhere um we'll work out more about angular um we'll work out more about angular um we'll work out more about angular momentum a little more and then we'll momentum a little more and then we'll momentum a little more and then we'll apply it to atoms and understand a apply it to atoms and understand a apply it to atoms and understand a little bit about Atomic uh little bit about Atomic uh little bit about Atomic uh Spectra a little bit about the spectrum Spectra a little bit about the spectrum Spectra a little bit about the spectrum of the hydrogen of the hydrogen of the hydrogen atom uh but this is where the atom uh but this is where the atom uh but this is where the degeneracies or some of the degeneracies degeneracies or some of the degeneracies degeneracies or some of the degeneracies well it's where all of the exact degener well it's where all of the exact degener


Advanced Quantum Mechanics Lecture 4
4:00 · 28% match
are things we're going to study these are things we're going to study but uh to prepare ourselves for that we but uh to prepare ourselves for that we but uh to prepare ourselves for that we studied a bit the harmonic oscillator studied a bit the harmonic oscillator studied a bit the harmonic oscillator and I want to expand on it a bit remind and I want to expand on it a bit remind and I want to expand on it a bit remind you what the rules you what the rules you what the rules are we started with the harmonic are we started with the harmonic are we started with the harmonic oscillator with a hamiltonian which I oscillator with a hamiltonian which I oscillator with a hamiltonian which I wrote as p^2 over twice the mass and I wrote as p^2 over twice the mass and I wrote as p^2 over twice the mass and I set the mass equal to one just uh to set the mass equal to one just uh to set the mass equal to one just uh to make my life simple you can go back and make my life simple you can go back and make my life simple you can go back and do it with a mass not equal to one I do it with a mass not equal to one I do it with a mass not equal to one I believe in our uh in our book art we do believe in our uh in our book art we do believe in our uh in our book art we do it with a general mass or we do it with it with a general mass or we do it with it with a general mass or we do it with yeah okay so it's done with a general yeah okay so it's done with a general


Advanced Quantum Mechanics Lecture 3
51:34 · 28% match
on S of R let's say the time independent on S of R let's say the time independent shinger equation what is the time shinger equation what is the time shinger equation what is the time independent shringer equation what do independent shringer equation what do independent shringer equation what do you put on the right hand side the energy and it determines the igen values energy and it determines the igen values and the IG vectors of energy now what is and the IG vectors of energy now what is and the IG vectors of energy now what is h h begins with PR squar what is PR h h begins with PR squar what is PR h h begins with PR squar what is PR PR R is of course I D PR R is of course I D PR R is of course I D bydr as always in quantum mechanics a bydr as always in quantum mechanics a bydr as always in quantum mechanics a component of the momentum is I bar time component of the momentum is I bar time component of the momentum is I bar time derivative with respect to the the derivative with respect to the the derivative with respect to the the corresponding corresponding corresponding coordinate so p s here's PR s PR s is coordinate so p s here's PR s PR s is coordinate so p s here's PR s PR s is going to going to going to equal minus because of two factors of i equal minus because of two factors of i equal minus because of two factors of i h bar squ I'm putting in the H bars now h bar squ I'm putting in the H bars now


Advanced Quantum Mechanics Lecture 9
1:05:49 · 28% match
study what we did was to study what we did was to study non-relativistic non-relativistic non-relativistic second quantization. second quantization. second quantization. Now, we want to um Now, we want to um Now, we want to um move on a little bit move on a little bit move on a little bit and study the relativistic electron. We're going to study we're going to We're going to study we're going to begin with a one-dimensional electron, begin with a one-dimensional electron, begin with a one-dimensional electron, an electron only moving in one direction an electron only moving in one direction an electron only moving in one direction dimension. The simplest possible theory dimension. The simplest possible theory dimension. The simplest possible theory of a electron. It's not a realistic of a electron. It's not a realistic of a electron. It's not a realistic theory. Electrons move in three theory. Electrons move in three theory. Electrons move in three dimensions, dimensions, dimensions, but it's the easiest place to get but it's the easiest place to get but it's the easiest place to get started. Without having to throw a bunch started. Without having to throw a bunch started. Without having to throw a bunch of formulas and a bunch of symbols, of formulas and a bunch of symbols, of formulas and a bunch of symbols, we can study the one-dimensional we can study the one-dimensional we can study the one-dimensional electron and learn quite a lot


Advanced Quantum Mechanics Lecture 4
0:12 · 27% match
University uh harmonic oscillator Let's University uh harmonic oscillator Let's uh just very briefly review the harmonic uh just very briefly review the harmonic uh just very briefly review the harmonic oscillator because it's going to come up oscillator because it's going to come up oscillator because it's going to come up time and time again in what uh what time and time again in what uh what time and time again in what uh what happens from here on in as I said happens from here on in as I said happens from here on in as I said harmonic oscillators are ubiquitous they harmonic oscillators are ubiquitous they harmonic oscillators are ubiquitous they are C all over the place anytime you are C all over the place anytime you are C all over the place anytime you have a system which has an equilibrium have a system which has an equilibrium have a system which has an equilibrium state it could be classical or it could state it could be classical or it could state it could be classical or it could be quantum mechanical but uh but be quantum mechanical but uh but be quantum mechanical but uh but classical in particular if it has an classical in particular if it has an classical in particular if it has an equilibrium State and you displace it equilibrium State and you displace it equilibrium State and you displace it from equilibrium generally speaking it from equilibrium generally speaking it from equilibrium generally speaking it will will will oscillate it may oscillate with more


Advanced Quantum Mechanics Lecture 2
47:55 · 27% match
happens you have a great whenever that happens you have a great deal of power over the system to be able deal of power over the system to be able deal of power over the system to be able to say a lot about the nature of the to say a lot about the nature of the to say a lot about the nature of the energy levels and degeneracies among energy levels and degeneracies among energy levels and degeneracies among [Music] [Music] [Music] them okay so that's that's the general them okay so that's that's the general them okay so that's that's the general oh what is what is such a structure oh what is what is such a structure oh what is what is such a structure called the the collection of symmetry called the the collection of symmetry called the the collection of symmetry operations a group this is a symmetry operations a group this is a symmetry operations a group this is a symmetry group this is a symmetry group why why do we care that uh group why why do we care that uh these two things are degenerate what why these two things are degenerate what why these two things are degenerate what why do we care that it's degenerate or not do we care that it's degenerate or not do we care that it's degenerate or not it would certainly be important if for it would certainly be important if for it would certainly be important if for example we wanted to know if from one example we wanted to know if from one example we wanted to know if from one state you could emit a photon and go


Advanced Quantum Mechanics Lecture 7
1:02:26 · 27% match
are operators the left hand these things are operators the left hand side is an operator it's not a number side is an operator it's not a number side is an operator it's not a number it's an operator What operator well it's it's an operator What operator well it's it's an operator What operator well it's a thing which has to do with the energy a thing which has to do with the energy a thing which has to do with the energy it's the hamiltonian of the field it's the hamiltonian of the field it's the hamiltonian of the field Theory okay it's the hamiltonian of the Theory okay it's the hamiltonian of the Theory okay it's the hamiltonian of the field field field Theory but it's also the Theory but it's also the Theory but it's also the energy question energy question energy question yeah most fundamental thing how did you yeah most fundamental thing how did you yeah most fundamental thing how did you go from a multi particle system to a go from a multi particle system to a go from a multi particle system to a field there I went through every single there I went through every single step in fact I belabored the steps no no step in fact I belabored the steps no no step in fact I belabored the steps no no I went I followed all the steps but I I went I followed all the steps but I I went I followed all the steps but I don't don't don't see why this represents a f it's a see why this represents a f it's a see why this represents a f it's a function of position that's all yeah


Advanced Quantum Mechanics Lecture 7
48:43 · 27% match
they're functions of I they're position they're functions of I they're functions of which energy level we're functions of which energy level we're functions of which energy level we're talking talking talking about okay okay so what are the Omega I the okay okay so what are the Omega I the Omega I are the energy levels which are Omega I are the energy levels which are Omega I are the energy levels which are the solutions of the Schrodinger the solutions of the Schrodinger the solutions of the Schrodinger equation the time independent shringer equation the time independent shringer equation the time independent shringer equation to find the energy levels of a equation to find the energy levels of a equation to find the energy levels of a system you solve the Schrodinger system you solve the Schrodinger system you solve the Schrodinger equation and you find out which igen equation and you find out which igen equation and you find out which igen values on the right hand side of the values on the right hand side of the values on the right hand side of the time independent shorting equation give time independent shorting equation give time independent shorting equation give you you you Solutions all right so let's write out Solutions all right so let's write out Solutions all right so let's write out the time independent shring your the time independent shring your the time independent shring your equation now we're going to write an equation now we're going to write an


Advanced Quantum Mechanics Lecture 9
43:02 · 26% match
it. Okay, so now we have the basic rules Okay, so now we have the basic rules basic rules of a simple version of basic rules of a simple version of basic rules of a simple version of quantum field theory. quantum field theory. quantum field theory. You'll have creation and annihilation You'll have creation and annihilation You'll have creation and annihilation operators. operators. operators. You'll have fields made out of them. You'll have fields made out of them. You'll have fields made out of them. The fields are functions of position and The fields are functions of position and The fields are functions of position and they can be thought of as creation and they can be thought of as creation and they can be thought of as creation and annihilation operators for particles at annihilation operators for particles at annihilation operators for particles at definite positions. definite positions. definite positions. Each type of particle has its own field. And you write down Hamiltonians. The And you write down Hamiltonians. The Hamiltonians always contain or typically Hamiltonians always contain or typically Hamiltonians always contain or typically contain contain contain typically contain the kinetic energies typically contain the kinetic energies typically contain the kinetic energies of the particles. of the particles. of the particles. That's the top thing there. That's the top thing there. That's the top thing there. And then in addition, various other


Advanced Quantum Mechanics Lecture 7
1:15:25 · 26% match
all there is have some background in all there is have some background in cover spaces Vector spaces no I don't cover spaces Vector spaces no I don't cover spaces Vector spaces no I don't think so so he just had well he made it think so so he just had well he made it think so so he just had well he made it all up all up all up himself which is fortunate because had himself which is fortunate because had himself which is fortunate because had he used the the notations that were he used the the notations that were he used the the notations that were there already you there already you there already you know I taught quantum mechanics last know I taught quantum mechanics last know I taught quantum mechanics last year for the in the mathematics year for the in the mathematics year for the in the mathematics Department which was a lot of fun but Department which was a lot of fun but Department which was a lot of fun but there was a crazy point at which I was there was a crazy point at which I was there was a crazy point at which I was explaining their act notation and I told explaining their act notation and I told explaining their act notation and I told them that every Vector we call the them that every Vector we call the them that every Vector we call the we call these a vector space or whatever we call these a vector space or whatever we call these a vector space or whatever s and the official s and the official s and the official term the cats and the official


Advanced Quantum Mechanics Lecture 9
8:23 · 26% match
let's let's begin by looking at Okay, let's let's begin by looking at Okay, let's let's begin by looking at this term here. Let's forget the other this term here. Let's forget the other this term here. Let's forget the other term and see what it does when it acts term and see what it does when it acts term and see what it does when it acts on a state with a total with a given on a state with a total with a given on a state with a total with a given total momentum. total momentum. total momentum. Okay. Okay. Okay. So, what do we want to do? We want to So, what do we want to do? We want to So, what do we want to do? We want to rewrite this in the momentum basis. rewrite this in the momentum basis. rewrite this in the momentum basis. Let me remind you how that worked. That Let me remind you how that worked. That Let me remind you how that worked. That was just a good old Fourier transform. Okay, so the way that works Okay, so the way that works is you say the creation operator for a is you say the creation operator for a is you say the creation operator for a Oh, this happens to be the annihilation Oh, this happens to be the annihilation Oh, this happens to be the annihilation operator, but the annihilation operator operator, but the annihilation operator operator, but the annihilation operator for a particle at point x is an integral for a particle at point x is an integral for a particle at point x is an integral over all of the momentum. over all of the momentum.


Advanced Quantum Mechanics Lecture 4
1:45 · 26% match
if you have radiation for basically if you have radiation for example in a uh in a cavity or in a wave example in a uh in a cavity or in a wave example in a uh in a cavity or in a wave guide or something like that then the guide or something like that then the guide or something like that then the radiation the electric and magnetic radiation the electric and magnetic radiation the electric and magnetic fields oscillate with definite fields oscillate with definite fields oscillate with definite frequencies again what would be the frequencies again what would be the frequencies again what would be the equal equilibrium configuration of the equal equilibrium configuration of the equal equilibrium configuration of the radiation field I said start with radiation field I said start with radiation field I said start with something which has an equilibrium something which has an equilibrium something which has an equilibrium configuration what is the equilibrium configuration what is the equilibrium configuration what is the equilibrium configuration of the electromagnetic configuration of the electromagnetic configuration of the electromagnetic field the answer is no electromagnetic field the answer is no electromagnetic field the answer is no electromagnetic field the vacuum empty space with no field the vacuum empty space with no field the vacuum empty space with no electromagnetic oscillations in it no electromagnetic oscillations in it no


Advanced Quantum Mechanics Lecture 2
1:44:03 · 26% match
of equal energy and in this case states of equal energy and in this case the states of equal energy are just the states of equal energy are just the states of equal energy are just found by going up and down this ladder found by going up and down this ladder found by going up and down this ladder in this in this in this way these just States go to the way these just States go to the way these just States go to the different axis like the Z axis is different axis like the Z axis is different axis like the Z axis is equivalent to the Y AIS yeah yeah equivalent to the Y AIS yeah yeah equivalent to the Y AIS yeah yeah they're they're very closely related to they're they're very closely related to they're they're very closely related to the idea of taking a state and rotating the idea of taking a state and rotating the idea of taking a state and rotating it yes that uh for example you could ask it yes that uh for example you could ask it yes that uh for example you could ask the question what are the igen vectors the question what are the igen vectors the question what are the igen vectors of el of el of el subex the igen vectors of el subex are subex the igen vectors of el subex are subex the igen vectors of el subex are not individual ones of these but linear not individual ones of these but linear not individual ones of these but linear combinations of them right linear combinations of them right linear combinations of them right linear combinations of these are igon vectors


Advanced Quantum Mechanics Lecture 9
43:39 · 26% match
particles. of the particles. That's the top thing there. That's the top thing there. That's the top thing there. And then in addition, various other And then in addition, various other And then in addition, various other concoctions concoctions concoctions which um which um which um let's put it this way. In the uh in the let's put it this way. In the uh in the let's put it this way. In the uh in the first round of particle physics, those first round of particle physics, those first round of particle physics, those concoctions largely came from concoctions largely came from concoctions largely came from experiment. experiment. experiment. Well, electrodynamics of course came Well, electrodynamics of course came Well, electrodynamics of course came from uh a little more than just from uh a little more than just from uh a little more than just experiment. But a classic example is a experiment. But a classic example is a experiment. But a classic example is a theory of beta decay. The theory of beta theory of beta decay. The theory of beta theory of beta decay. The theory of beta decay is a uh neutron decaying into a decay is a uh neutron decaying into a decay is a uh neutron decaying into a proton, an electron, and a neutrino. proton, an electron, and a neutrino. proton, an electron, and a neutrino. Okay? Okay? Okay? Proton goes to electron Proton goes to electron Proton goes to electron and so forth. and so forth. and so forth. All right, so what would you write


Advanced Quantum Mechanics Lecture 3
50:15 · 26% match
from the origin to a maximum distance from the origin to a maximum distance from the origin to a maximum and back again so these are orbits which and back again so these are orbits which and back again so these are orbits which go from a minimum distance to a maximum go from a minimum distance to a maximum go from a minimum distance to a maximum distance and back again for the Kum distance and back again for the Kum distance and back again for the Kum potential they would be the elliptical potential they would be the elliptical potential they would be the elliptical orbits and that's the classical physics in a and that's the classical physics in a nutshell that's the classical nutshell that's the classical nutshell that's the classical physics what about the quantum physics what about the quantum physics what about the quantum physics for the quantum physics we have physics for the quantum physics we have physics for the quantum physics we have a wave a wave a wave function the wave function instead of we function the wave function instead of we function the wave function instead of we don't have a particle position we don't don't have a particle position we don't don't have a particle position we don't have a momentum we have a wave function have a momentum we have a wave function have a momentum we have a wave function and the wave and the wave and the wave function is s of R and also function is s of R and also function is s of R and also angles but the angular structure


Advanced Quantum Mechanics Lecture 5
47:37 · 25% match
the psi that you get In other words, the psi that you get when you rotate by angle theta is what? E to the I M theta E to the I M theta psi of zero. This is just the equation that says a This is just the equation that says a derivative of something is equal to M derivative of something is equal to M derivative of something is equal to M times the something. times the something. times the something. And that would be the solution of it. And that would be the solution of it. And that would be the solution of it. Okay. Okay. Okay. Remember what what were the eigen values Remember what what were the eigen values Remember what what were the eigen values that we discovered were possible that we discovered were possible that we discovered were possible for the Z component of angular momentum for the Z component of angular momentum for the Z component of angular momentum when we analyzed the commutation when we analyzed the commutation when we analyzed the commutation relations? relations? relations? Remember we did that? We found two kinds Remember we did that? We found two kinds Remember we did that? We found two kinds of things. of things. of things. One had integer spectrum and the other One had integer spectrum and the other One had integer spectrum and the other had half integer spectrum. had half integer spectrum. had half integer spectrum. That was just a mathematical exercise That was just a mathematical exercise


Advanced Quantum Mechanics Lecture 5
7:16 · 25% match
the next one? Hm? What is it? What's the next one? Hm? What is it? What's the next one? Hm? What is it? Nitrogen. Nitrogen. At the next nitrogen Nitrogen. Nitrogen. At the next nitrogen Nitrogen. Nitrogen. At the next nitrogen level, you would have to start filling level, you would have to start filling level, you would have to start filling up these up here. But that's not the way up these up here. But that's not the way up these up here. But that's not the way it works. The spectroscopy it works. The spectroscopy it works. The spectroscopy and everything we know about it is and everything we know about it is and everything we know about it is consistent with putting consistent with putting consistent with putting the fifth is it the fifth electron? the fifth is it the fifth electron? the fifth is it the fifth electron? One, One, One, two, two, two, whatever. Uh the uh the uh whatever. Uh the uh the uh whatever. Uh the uh the uh the next one the next one the next one fits in again into one of these levels. fits in again into one of these levels. fits in again into one of these levels. And that works until you've gotten to neon? Neon. Neon. neon? Neon. Neon. Okay. Okay. Okay. In neon, there are eight electrons in In neon, there are eight electrons in In neon, there are eight electrons in this first excited energy level here. Why are there eight? Well, one for each Why are there eight? Well, one for each orbital angular one for each orbital orbital angular one for each orbital


Advanced Quantum Mechanics Lecture 8
1:29:10 · 25% match
States um here's something that we wrote um here's something that we wrote um here's something that we wrote down for creation and Annihilation I do you remember what the commutator I do you remember what the commutator of A+ with a minus is Del Delta i j what about a minus with a j what about a minus with a minus for any I and minus for any I and minus for any I and J zero what about A+ with J zero what about A+ with J zero what about A+ with A+ zero these are the only commutators A+ zero these are the only commutators A+ zero these are the only commutators which are um which are um which are um nonzero okay well I could ask a nonzero okay well I could ask a nonzero okay well I could ask a different question I could ask instead different question I could ask instead different question I could ask instead what are the commutators of size of X at what are the commutators of size of X at what are the commutators of size of X at different positions instead of different positions instead of different positions instead of asking what are the commutation asking what are the commutation asking what are the commutation relations between the creation operators relations between the creation operators relations between the creation operators and Annihilation operators in the basis and Annihilation operators in the basis and Annihilation operators in the basis I and J I could ask what is the I and J I could ask what is the


Advanced Quantum Mechanics Lecture 10
1:18:52 · 24% match
one to the negative energy another one to the negative energy another one to the negative energy states and have the atom states and have the atom states and have the atom Decay by having the electrons sink down Decay by having the electrons sink down Decay by having the electrons sink down even even even lower what prevents that what prevents lower what prevents that what prevents lower what prevents that what prevents that is the electrons are already there that is the electrons are already there that is the electrons are already there but it can only prevent it if they're fion it's not a direct equation it's a fion it's not a direct equation it's a Klein Gordon equation which is different Klein Gordon equation which is different Klein Gordon equation which is different different and does not have the form H different and does not have the form H different and does not have the form H is equal to a linear function of is equal to a linear function of is equal to a linear function of P it's a more complicated uh P it's a more complicated uh P it's a more complicated uh uh right so you can look up now the uh right so you can look up now the uh right so you can look up now the Klein Gordon equation for bans we just Klein Gordon equation for bans we just Klein Gordon equation for bans we just don't have time for it now but I think don't have time for it now but I think don't have time for it now but I think you're probably in a good position to to


Advanced Quantum Mechanics Lecture 5
15:11 · 24% match
at X3, and so forth. So this is multi-particle quantum So this is multi-particle quantum So this is multi-particle quantum mechanics in a nutshell. mechanics in a nutshell. mechanics in a nutshell. Now, let's suppose that what we're Now, let's suppose that what we're Now, let's suppose that what we're talking about is identical particles. In talking about is identical particles. In talking about is identical particles. In other words, particles of exactly the other words, particles of exactly the other words, particles of exactly the same species. same species. same species. Electrons or whatever they happen to be. Electrons or whatever they happen to be. Electrons or whatever they happen to be. Ignoring spin for the moment. Ignoring spin for the moment. Ignoring spin for the moment. Uh Uh Uh particles which are identical, we have particles which are identical, we have particles which are identical, we have to ask the question. We talked about it to ask the question. We talked about it to ask the question. We talked about it last time. last time. last time. Uh we have to ask the question Uh we have to ask the question Uh we have to ask the question of of of whether whether whether a a a part particle one at position one and part particle one at position one and part particle one at position one and particle two at position two, is it the particle two at position two, is it the particle two at position two, is it the same state or is it a different state


Advanced Quantum Mechanics Lecture 10
1:14:20 · 24% match
brings us I think to the end for tonight so yeah can you say um how do tonight so yeah can you say um how do modern physicists think about this Asos modern physicists think about this Asos modern physicists think about this Asos to to using the direct to to using the direct to to using the direct C oh no oh very easy they just say C oh no oh very easy they just say C oh no oh very easy they just say forget the direct C just forget the direct C just forget the direct C just replace replace creation operators for replace replace creation operators for replace replace creation operators for negative energy by Annihilation negative energy by Annihilation negative energy by Annihilation operators for positive energy just do operators for positive energy just do operators for positive energy just do that flip in the uh in the formulas and that flip in the uh in the formulas and that flip in the uh in the formulas and when you do that then it becomes when you do that then it becomes when you do that then it becomes completely symmetric in the electrons completely symmetric in the electrons completely symmetric in the electrons and and and positrons you discover right away that positrons you discover right away that positrons you discover right away that it's a complete symmetry so you could it's a complete symmetry so you could it's a complete symmetry so you could think of the uh of the vacuum think of the uh of the vacuum


Advanced Quantum Mechanics Lecture 8
41:05 · 23% match
bit of a break at least for part of the hour tonight at least for part of the hour tonight at least for part of the hour tonight and talk about and talk about and talk about um real physical um real physical um real physical phenomena not that the quantum field phenomena not that the quantum field phenomena not that the quantum field theory is not a real physical phenomenon theory is not a real physical phenomenon theory is not a real physical phenomenon but you know we've been concentrating on but you know we've been concentrating on but you know we've been concentrating on the formal mathematics of the formal mathematics of the formal mathematics of it is the electron a sphere what would it is the electron a sphere what would it is the electron a sphere what would it mean for the electron to be a sphere it mean for the electron to be a sphere it mean for the electron to be a sphere what does it mean for anything to be a what does it mean for anything to be a what does it mean for anything to be a sphere a particle or an atom or whatever sphere a particle or an atom or whatever sphere a particle or an atom or whatever else uh and what is it that was or else uh and what is it that was or else uh and what is it that was or wasn't wasn't wasn't measured that according to the author of measured that according to the author of measured that according to the author of the Scientific American little blurb the Scientific American little blurb


Advanced Quantum Mechanics Lecture 10
4:25 · 21% match
that with with the objects guaranteed that with with the objects and the theory that we've been making up and the theory that we've been making up and the theory that we've been making up till now that they satisfy this kind of till now that they satisfy this kind of till now that they satisfy this kind of Bose statistics this kind of Bon rules Bose statistics this kind of Bon rules Bose statistics this kind of Bon rules now for now for now for Fons the rule is exactly the same but Fons the rule is exactly the same but Fons the rule is exactly the same but with a minus with a minus with a minus sign remember that the state Vector of a sign remember that the state Vector of a sign remember that the state Vector of a system the real physical observable system the real physical observable system the real physical observable State Vector of a State Vector of a State Vector of a system doesn't care about the sign here system doesn't care about the sign here system doesn't care about the sign here but in keeping track of the formulas but in keeping track of the formulas but in keeping track of the formulas it's important to know it's important to know it's important to know that for Fons if you interchange the two that for Fons if you interchange the two that for Fons if you interchange the two particles you get a minus particles you get a minus particles you get a minus sign that must sign that must sign that must mean that for Fons if SI here is mean that for Fons if SI here is


Advanced Quantum Mechanics Lecture 10
1:21:16 · 20% match
constant there you constant there you [Laughter] yeah yeah right and uh right and uh right and uh right you can either think of it as the right you can either think of it as the right you can either think of it as the energy in the direct sea energy in the direct sea energy in the direct sea but you can also just think of it as the but you can also just think of it as the but you can also just think of it as the zero point zero point zero point oscillation of the fields photons you oscillation of the fields photons you oscillation of the fields photons you don't usually think of is filling up um don't usually think of is filling up um don't usually think of is filling up um a dxi but they also contribute vacuum a dxi but they also contribute vacuum a dxi but they also contribute vacuum energy a half har bar Omega for every energy a half har bar Omega for every energy a half har bar Omega for every uh for uh for uh for every oscillating mode of the of the every oscillating mode of the of the every oscillating mode of the of the electromagnetic field and that's also electromagnetic field and that's also electromagnetic field and that's also infinite now it is true that for the infinite now it is true that for the infinite now it is true that for the photons and for bosons in general a photons and for bosons in general a photons and for bosons in general a curious fact is that um for photons the curious fact is that um for photons the


Advanced Quantum Mechanics Lecture 8
50:50 · 20% match
is such that the first angular levels is such that the first angular levels is such that the first angular momentum excitation is just more energy momentum excitation is just more energy momentum excitation is just more energy than you have available than you have available than you have available in in in your in your photons that are doing the your in your photons that are doing the your in your photons that are doing the measuring what if the energy to the measuring what if the energy to the measuring what if the energy to the first excited rotational state is first excited rotational state is first excited rotational state is gigantic for some gigantic for some gigantic for some reason then your apparatus simply reason then your apparatus simply reason then your apparatus simply canot resolve the canot resolve the canot resolve the orientation so it becomes a question orientation so it becomes a question orientation so it becomes a question given your apparatus what is the exit given your apparatus what is the exit given your apparatus what is the exit how much energy does it take to excite how much energy does it take to excite how much energy does it take to excite the first angular momentum State now for the first angular momentum State now for the first angular momentum State now for a basketball or a dumbbell a real a basketball or a dumbbell a real a basketball or a dumbbell a real dumbbell the energy separation between dumbbell the energy separation between