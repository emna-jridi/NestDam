
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({
    description: 'ID Token Google obtenu depuis le SDK Google Sign-In côté client (Android/iOS)',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjE4MmU0NTBhMzVhMjA4Y2FlZDczZjI5OGQ5OGE3ZDlhODgwZWY0Y2QiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJhenAiOiIxMjM0NTY3ODkwLWFiY2RlZmdoaWprbG1ub3AuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJhdWQiOiIxMjM0NTY3ODkwLWFiY2RlZmdoaWprbG1ub3AuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJzdWIiOiIxMDk2OTQ1MzUyOTQ1MjczNDcxMjMiLCJlbWFpbCI6ImpvaG4uZG9lQGV4YW1wbGUuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImF0X2hhc2giOiJhYmNkZWZnaGlqa2xtbm9wIiwibmFtZSI6IkpvaG4gRG9lIiwicGljdHVyZSI6Imh0dHBzOi8vbGgzLmdvb2dsZXVzZXJjb250ZW50LmNvbS9hL0FBY0hUdGNYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYIiwiZ2l2ZW5fbmFtZSI6IkpvaG4iLCJmYW1pbHlfbmFtZSI6IkRvZSIsImxvY2FsZSI6ImVuIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjE3MDAwMDM2MDB9.signature_here',
    type: String,
    minLength: 100,
  })
  @IsString()
  @IsNotEmpty({ message: 'ID Token Google est requis' })
  idToken: string;
<<<<<<< HEAD
}

=======
}
>>>>>>> origin/report
