package com.otzar.sscm.service;

import com.otzar.sscm.entities.Client;
import com.otzar.sscm.entities.User;
import com.otzar.sscm.models.CreateClientRequest;
import com.otzar.sscm.models.UpdateClientRequest;
import com.otzar.sscm.repository.ClientRepository;
import com.otzar.sscm.repository.UserRepository;
import com.otzar.sscm.validation.ClientFieldNormalizer;
import org.springframework.stereotype.Service;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
public class ClientService {

    private final ClientRepository clientRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public ClientService(ClientRepository clientRepository, UserRepository userRepository,
                         PasswordEncoder passwordEncoder) {
        this.clientRepository = clientRepository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public List<Client> findAll() {
        return enrichEmails(clientRepository.findAll());
    }

    public List<Client> findArchived() {
        return enrichEmails(clientRepository.findArchived());
    }

    public Optional<Client> findById(Long id) {
        return clientRepository.findById(id).map(this::enrichEmail);
    }

    public Optional<Client> findByUserId(Long userId) {
        return clientRepository.findByUserId(userId);
    }

    public boolean isLinkedToUsername(Long clientId, String username) {
        if (clientId == null || username == null) return false;
        return clientRepository.findActiveById(clientId)
                .flatMap(client -> userRepository.findById(client.getUser_id()))
                .map(User::getUsername)
                .map(linkedUsername -> username.equalsIgnoreCase(linkedUsername))
                .orElse(false);
    }

    public Client create(CreateClientRequest request) {
        User user = new User();
        user.setFull_name(valueOrFallback(request.getFullName(), request.getBusinessName()));
        user.setEmail(ClientFieldNormalizer.normalizeEmail(request.getEmail()));
        user.setUsername(request.getUsername());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setRole("CLIENT");
        user.setToken("");

        userRepository.save(user);

        Client client = new Client();
        client.setUser_id(user.getUser_id());
        client.setAdmin_id(request.getAdminId());
        client.setBusiness_name(request.getBusinessName());
        client.setPhone(request.getPhone());
        client.setInstagramUsername(request.getInstagramUsername());
        client.setArchived(false);

        Client saved = clientRepository.save(client);
        saved.setEmail(user.getEmail());
        return saved;
    }

    public Optional<Client> update(Long id, UpdateClientRequest request) {
        Optional<Client> existingClient = clientRepository.findById(id);

        if (existingClient.isEmpty()) {
            return Optional.empty();
        }

        Client client = existingClient.get();

        if (request.getUserId() != null) {
            client.setUser_id(request.getUserId());
        }

        if (Boolean.TRUE.equals(request.getClearAdminAssignment())) {
            client.setAdmin_id(null);
        } else if (request.getAdminId() != null) {
            client.setAdmin_id(request.getAdminId());
        }

        if (request.getBusinessName() != null) {
            client.setBusiness_name(request.getBusinessName());
        }

        if (request.getPhone() != null) {
            client.setPhone(request.getPhone());
        }

        if (request.isInstagramUsernameProvided()) {
            client.setInstagramUsername(request.getInstagramUsername());
        }
        if (request.isEmailProvided()) {
            userRepository.findById(client.getUser_id()).ifPresent(user -> {
                user.setEmail(ClientFieldNormalizer.normalizeEmail(request.getEmail()));
                userRepository.save(user);
            });
        }

        return Optional.of(enrichEmail(clientRepository.save(client)));
    }

    @Transactional
    public DeleteResult delete(Long id) {
        Optional<Client> existingClient = clientRepository.findById(id);

        if (existingClient.isEmpty()) {
            return DeleteResult.NOT_FOUND;
        }

        Client client = existingClient.get();
        if (clientRepository.countContent(id) > 0) {
            return DeleteResult.HAS_CONTENT;
        }
        Optional<User> associatedUser = userRepository.findById(client.getUser_id());
        boolean canDeleteAssociatedUser = associatedUser
                .filter(user -> "CLIENT".equalsIgnoreCase(user.getRole()))
                .filter(user -> !userRepository.hasReferencesOutsideClient(user.getUser_id(), client.getClient_id()))
                .isPresent();

        clientRepository.delete(client);
        if (canDeleteAssociatedUser) {
            userRepository.delete(associatedUser.get());
        }
        return DeleteResult.DELETED;
    }

    @Transactional
    public Optional<Client> archive(Long id) {
        return clientRepository.findById(id).map(client -> {
            client.setArchived(true);
            userRepository.findById(client.getUser_id()).ifPresent(user -> {
                if ("CLIENT".equalsIgnoreCase(user.getRole())) {
                    user.setToken("");
                    userRepository.save(user);
                }
            });
            return clientRepository.save(client);
        });
    }

    @Transactional
    public Optional<Client> restore(Long id) {
        return clientRepository.findById(id).map(client -> {
            client.setArchived(false);
            return clientRepository.save(client);
        });
    }

    public Optional<Long> contentCount(Long id) {
        return clientRepository.findById(id).map(client -> clientRepository.countContent(id));
    }

    public enum DeleteResult {
        DELETED, NOT_FOUND, HAS_CONTENT
    }

    private String valueOrFallback(String value, String fallback) {
        if (value == null || value.trim().isEmpty()) {
            return fallback;
        }

        return value;
    }

    private List<Client> enrichEmails(List<Client> clients) {
        clients.forEach(this::enrichEmail);
        return clients;
    }

    private Client enrichEmail(Client client) {
        userRepository.findById(client.getUser_id()).ifPresent(user -> client.setEmail(user.getEmail()));
        return client;
    }
}
