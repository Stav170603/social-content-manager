package com.otzar.sscm.models;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.multipart.MultipartFile;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

public class CreateContentMultipartRequest {
    @NotNull(message = "Client ID is required")
    private Long clientId;
    @NotBlank(message = "Title is required")
    private String title;
    private String description;
    private String contentType;

    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
    private LocalDateTime plannedPublishDate;

    private MultipartFile file;
    private List<MultipartFile> files = new ArrayList<>();
    private List<MultipartFile> coverFiles = new ArrayList<>();
    private List<Integer> coverMediaIndexes = new ArrayList<>();
    private String videoEditsJson;
    private List<MultipartFile> musicFiles = new ArrayList<>();
    private List<Integer> musicMediaIndexes = new ArrayList<>();

    public Long getClientId() {
        return clientId;
    }

    public void setClientId(Long clientId) {
        this.clientId = clientId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getContentType() {
        return contentType;
    }

    public void setContentType(String contentType) {
        this.contentType = contentType;
    }

    public LocalDateTime getPlannedPublishDate() {
        return plannedPublishDate;
    }

    public void setPlannedPublishDate(LocalDateTime plannedPublishDate) {
        this.plannedPublishDate = plannedPublishDate;
    }

    public MultipartFile getFile() {
        return file;
    }

    public void setFile(MultipartFile file) {
        this.file = file;
    }
    public List<MultipartFile> getFiles(){return files;} public void setFiles(List<MultipartFile> files){this.files=files==null?new ArrayList<>():files;}
    public List<MultipartFile> allFiles(){
        List<MultipartFile> all=new ArrayList<>(); if(file!=null&&!file.isEmpty()) all.add(file);
        for(MultipartFile item:files) if(item!=null&&!item.isEmpty()) all.add(item); return all;
    }
    public List<MultipartFile> getCoverFiles(){return coverFiles;} public void setCoverFiles(List<MultipartFile> value){coverFiles=value==null?new ArrayList<>():value;}
    public List<Integer> getCoverMediaIndexes(){return coverMediaIndexes;} public void setCoverMediaIndexes(List<Integer> value){coverMediaIndexes=value==null?new ArrayList<>():value;}
    public String getVideoEditsJson(){return videoEditsJson;} public void setVideoEditsJson(String value){videoEditsJson=value;}
    public List<MultipartFile> getMusicFiles(){return musicFiles;} public void setMusicFiles(List<MultipartFile> value){musicFiles=value==null?new ArrayList<>():value;}
    public List<Integer> getMusicMediaIndexes(){return musicMediaIndexes;} public void setMusicMediaIndexes(List<Integer> value){musicMediaIndexes=value==null?new ArrayList<>():value;}
}
